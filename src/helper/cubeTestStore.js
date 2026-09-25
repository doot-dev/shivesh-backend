import db from '../config/database.js';
import { resolveToDate, SELECTABLE_PERIODS, withStatus } from './cubeTest.js';
import { productByName } from './productUnits.js';
import { getCubeTestPublicUrl } from '../config/cubeTestUploadConfig.js';

/**
 * Writing cube tests — one copy for the panel, the field app and the client
 * app, so the date rules and attachments behave the same everywhere.
 *
 * A test has any number of attachments (result sheets, photos), added at any
 * time. CubeTest.fileUrl mirrors the newest live one: old app builds read it
 * and the status (RESULT_ADDED) is keyed off it.
 */

/** Live attachments, oldest first. Spread into every cube test query the apps or panel read. */
export const WITH_ATTACHMENTS = {
  attachments: {
    where: { isDeleted: false },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, fileUrl: true, fileName: true, mimeType: true, addedByType: true, addedByName: true, createdAt: true },
  },
};

/** Uploaded files from a multipart body: `files` (many), plus the single `file` old builds send. */
export const uploadedFiles = (req) => [
  ...(req.files?.files ?? []),
  ...(req.files?.file ?? []),
  ...(req.file ? [req.file] : []),
];

/** Point CubeTest.fileUrl at the newest live attachment (null when none) and return the test with its attachments. */
async function syncFileUrl(tx, cubeTestId) {
  const newest = await tx.cubeTestAttachment.findFirst({
    where: { cubeTestId, isDeleted: false },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { fileUrl: true },
  });
  return tx.cubeTest.update({
    where: { id: cubeTestId },
    data: { fileUrl: newest?.fileUrl ?? null },
    include: WITH_ATTACHMENTS,
  });
}

/**
 * Create a cube test (existing = null) or edit one, and add every uploaded file
 * as a new attachment. Only the fields sent change on an edit.
 *
 * `order` is the resolved Order row (the caller has already checked the caller
 * may touch it). `actor` = { type: USER | FIELD_TECH | CLIENT_CONTACT, id, name }.
 *
 * Returns { status, message } when refused, else { cubeTest, added, resultAdded }.
 */
export async function saveCubeTest({ order, existing = null, body = {}, files = [], actor }) {
  const { quantity } = body;
  // On an edit, a value equal to the saved one is not a change: forms re-send
  // everything, and an old test (a 14-day period, a casting date the rules
  // would refuse today) must still take new files and a new quantity.
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  const period = body.period && body.period !== existing?.period ? body.period : undefined;
  const castingDate = body.castingDate && !(existing && sameDay(body.castingDate, existing.castingDate)) ? body.castingDate : undefined;
  const customDate = body.customDate && !(existing?.period === 'CUSTOM' && sameDay(body.customDate, existing.toDate)) ? body.customDate : undefined;

  if (!existing && (!castingDate || !quantity || !period)) {
    return { status: 400, message: 'castingDate, quantity and period are required' };
  }
  if (period && !SELECTABLE_PERIODS.includes(period)) {
    return { status: 422, message: `period must be one of ${SELECTABLE_PERIODS.join(', ')}` };
  }
  // W38: cube tests only make sense for concrete.
  if (!existing && (await productByName(order.productName))?.isConcrete === false) {
    return { status: 400, message: 'Cube tests apply only to concrete products' };
  }

  const nextPeriod = period || existing.period;
  const nextCasting = castingDate ? new Date(castingDate) : new Date(existing.castingDate);
  if (Number.isNaN(nextCasting.getTime())) {
    return { status: 422, message: 'castingDate is not a valid date' };
  }

  // Same rules the controllers had: recompute the test date when the period,
  // casting date or custom date changes; a CUSTOM test keeps its typed date.
  let toDate = existing?.toDate;
  if (nextPeriod === 'CUSTOM' && !customDate) {
    if (!existing || existing.period !== 'CUSTOM') {
      return { status: 422, message: 'customDate is required when period is CUSTOM' };
    }
  } else if (!existing || period || castingDate || customDate) {
    const r = resolveToDate(nextPeriod, nextCasting, customDate, order);
    if (r.error) return { status: 400, message: r.error };
    toDate = r.toDate;
  }

  const fields = {
    castingDate: nextCasting,
    fromDate: nextCasting,
    toDate,
    period: nextPeriod,
    quantity: quantity ? String(quantity) : existing.quantity,
  };

  const cubeTest = await db.$transaction(async (tx) => {
    const ct = existing
      ? await tx.cubeTest.update({ where: { id: existing.id }, data: fields })
      : await tx.cubeTest.create({
          data: { ...fields, orderId: order.id, addedByType: actor.type, addedByName: actor.name ?? null },
        });
    if (files.length) {
      await tx.cubeTestAttachment.createMany({
        data: files.map((f) => ({
          cubeTestId: ct.id,
          fileUrl: getCubeTestPublicUrl(order.orderId, f.filename),
          fileName: f.originalname ? String(f.originalname).slice(0, 191) : null,
          mimeType: f.mimetype ?? null,
          addedByType: actor.type,
          addedById: actor.id != null ? String(actor.id) : null,
          addedByName: actor.name ?? null,
        })),
      });
    }
    return syncFileUrl(tx, ct.id);
  });

  return {
    cubeTest: withStatus(cubeTest),
    added: files.length,
    resultAdded: files.length > 0 && !existing?.fileUrl,
  };
}

/**
 * Remove one attachment (soft: the row and the stored file are kept for the
 * audit trail). `onlyAddedBy` limits it to files that party added — clients
 * may remove their own uploads, not the lab's.
 *
 * Returns { status, message, code? } when refused, else { cubeTest, removed }.
 */
export async function removeAttachment({ cubeTestId, attachmentId, onlyAddedBy = null }) {
  const att = await db.cubeTestAttachment.findFirst({
    where: { id: attachmentId, cubeTestId, isDeleted: false },
  });
  if (!att) return { status: 404, message: 'Attachment not found' };
  if (onlyAddedBy && att.addedByType !== onlyAddedBy) {
    return { status: 403, code: 'ROLE_FORBIDDEN', message: 'You can remove only the files your team added' };
  }
  const cubeTest = await db.$transaction(async (tx) => {
    await tx.cubeTestAttachment.update({ where: { id: att.id }, data: { isDeleted: true } });
    return syncFileUrl(tx, cubeTestId);
  });
  return { cubeTest: withStatus(cubeTest), removed: att };
}
