import db from '../config/database.js';
import logger from './logger.js';
import { createActivityLog } from './activityLogger.js';
import { normalizePhone, contactInclude } from './clientAccess.js';

/**
 * Client team rules (docs/06), shared by the panel's Team tab and the owner's
 * Team screen in the app. `actor` = { type: 'USER' | 'CLIENT_CONTACT' | 'SYSTEM', id,
 * canAssignOwner }. Only the office (USER) may make or change an Owner (Q1).
 * Rule breaks throw { status, message }.
 */

const fail = (status, message) => Object.assign(new Error(message), { status });

export function serializeContact(c) {
  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    designation: c.designation,
    role: { id: c.role.id, name: c.role.name, isOwner: c.role.isSystem },
    allProjects: c.allProjects,
    projects: c.projects.map((p) => ({ projectId: p.project.projectId, projectName: p.project.projectName })),
    isActive: c.isActive,
    lastLoginAt: c.lastLoginAt,
    createdByType: c.createdByType,
    createdAt: c.createdAt,
  };
}

export async function listContacts(clientDbId) {
  const rows = await db.clientContact.findMany({
    where: { clientId: clientDbId, isDeleted: false },
    include: contactInclude,
    orderBy: [{ role: { isSystem: 'desc' } }, { createdAt: 'asc' }],
  });
  return rows.map(serializeContact);
}

const managesTeam = (role) => role.isSystem || role.permissions.some((p) => p.permission === 'team.manage');

/** Never leave a company without an active person who can manage its team. */
async function keepAManager(clientDbId, contactId) {
  const others = await db.clientContact.count({
    where: {
      clientId: clientDbId,
      id: { not: contactId },
      isActive: true,
      isDeleted: false,
      role: { isActive: true, isDeleted: false, OR: [{ isSystem: true }, { permissions: { some: { permission: 'team.manage' } } }] },
    },
  });
  if (!others) throw fail(409, 'Keep at least one active person who can manage the team');
}

async function findEditable(clientDbId, contactId, actor) {
  const existing = await db.clientContact.findFirst({
    where: { id: contactId, clientId: clientDbId, isDeleted: false },
    include: { role: { include: { permissions: true } } },
  });
  if (!existing) throw fail(404, 'Contact not found');
  if (existing.role.isSystem && !actor.canAssignOwner) throw fail(403, 'Only the office can change an Owner');
  if (actor.type === 'CLIENT_CONTACT' && existing.id === actor.id) throw fail(409, "You can't change your own access");
  return existing;
}

async function audit(clientDbId, actor, event, title, description, after) {
  const client = await db.client.findFirst({ where: { id: clientDbId }, select: { clientId: true } });
  await createActivityLog({
    title,
    description,
    entityType: 'CLIENT',
    entityId: clientDbId,
    action: event === 'CLIENT_CONTACT_ADDED' ? 'CREATED' : 'UPDATED',
    event,
    ...(actor.type === 'USER' ? { createdById: actor.id } : { actorType: actor.type, actorId: String(actor.id) }),
    source: { USER: 'PANEL', CLIENT_CONTACT: 'CLIENT_APP' }[actor.type] ?? 'SYSTEM',
    clientRef: client?.clientId,
    after,
  });
}

/** A signed-out or removed person must stop getting this company's pushes. */
const dropDevices = (contactId) =>
  db.deviceToken.deleteMany({ where: { targetType: 'CLIENT_CONTACT', targetId: contactId } });

/** Add (no contactId) or edit a contact. Returns the saved contact, serialized. */
export async function saveContact(clientDbId, input, actor, contactId = null) {
  const existing = contactId ? await findEditable(clientDbId, contactId, actor) : null;

  const name = input.name !== undefined ? String(input.name).trim() : existing?.name;
  const phone = input.phone !== undefined ? normalizePhone(input.phone) : existing?.phone;
  if (!name) throw fail(400, 'Name is required');
  if (!/^[6-9]\d{9}$/.test(phone ?? '')) throw fail(400, 'Enter a valid 10-digit mobile number');

  const role = await db.clientRole.findFirst({
    where: { id: Number(input.roleId ?? existing?.roleId), isDeleted: false, isActive: true },
    include: { permissions: true },
  });
  if (!role) throw fail(400, 'Choose an active role');
  if (role.isSystem && !actor.canAssignOwner) throw fail(403, 'Only the office can make someone an Owner');

  // Q6: one phone number, one company.
  const clash = await db.clientContact.findFirst({
    where: { phone, isDeleted: false, ...(existing && { id: { not: existing.id } }) },
    select: { clientId: true },
  });
  if (clash) {
    throw fail(409, clash.clientId === clientDbId ? 'This number is already on the team' : 'This number already belongs to another company');
  }

  const allProjects = input.allProjects !== undefined ? Boolean(input.allProjects) : (existing?.allProjects ?? true);
  let projectIds = null;
  if (!allProjects && (input.projects !== undefined || !existing)) {
    const codes = Array.isArray(input.projects) ? input.projects.map(String) : [];
    const rows = await db.project.findMany({
      where: { clientId: clientDbId, isDeleted: false, projectId: { in: codes } },
      select: { id: true },
    });
    if (!rows.length) throw fail(400, 'Pick at least one project, or allow all projects');
    projectIds = rows.map((r) => r.id);
  }

  const isActive = input.isActive !== undefined ? Boolean(input.isActive) : (existing?.isActive ?? true);
  if (existing && managesTeam(existing.role) && !(isActive && managesTeam(role))) {
    await keepAManager(clientDbId, existing.id);
  }

  const data = {
    name,
    phone,
    designation: input.designation !== undefined ? String(input.designation).trim() || null : (existing?.designation ?? null),
    roleId: role.id,
    allProjects,
    isActive,
  };

  // A removed contact keeps its row (orders still point at it), and
  // (clientId, phone) is unique — so re-adding the same number revives it.
  const revived = existing
    ? null
    : await db.clientContact.findFirst({ where: { clientId: clientDbId, phone, isDeleted: true }, select: { id: true } });
  const targetId = existing?.id ?? revived?.id;

  const saved = await db.$transaction(async (tx) => {
    const c = targetId
      ? await tx.clientContact.update({ where: { id: targetId }, data: { ...data, isDeleted: false } })
      : await tx.clientContact.create({
          data: { ...data, clientId: clientDbId, createdByType: actor.type, createdById: String(actor.id) },
        });
    if (allProjects || projectIds) await tx.clientContactProject.deleteMany({ where: { contactId: c.id } });
    if (projectIds) {
      await tx.clientContactProject.createMany({ data: projectIds.map((projectId) => ({ contactId: c.id, projectId })) });
    }
    return tx.clientContact.findFirst({ where: { id: c.id }, include: contactInclude });
  });

  if (!isActive) await dropDevices(saved.id);

  const out = serializeContact(saved);
  const added = !existing;
  await audit(
    clientDbId,
    actor,
    added ? 'CLIENT_CONTACT_ADDED' : 'CLIENT_CONTACT_UPDATED',
    added ? 'Client team: contact added' : 'Client team: contact updated',
    `${out.name} (${out.phone}) — ${out.role.name}, ${out.allProjects ? 'all projects' : out.projects.map((p) => p.projectId).join(', ')}${out.isActive ? '' : ', inactive'}`,
    out,
  );
  return out;
}

/** Remove a contact from the team. The row stays for history (orders "placed by"). */
export async function removeContact(clientDbId, contactId, actor) {
  const existing = await findEditable(clientDbId, contactId, actor);
  if (existing.isActive && managesTeam(existing.role)) await keepAManager(clientDbId, existing.id);

  await db.clientContact.update({ where: { id: existing.id }, data: { isDeleted: true, isActive: false } });
  await dropDevices(existing.id);
  await audit(clientDbId, actor, 'CLIENT_CONTACT_REMOVED', 'Client team: contact removed', `${existing.name} (${existing.phone}) removed`, null);
}

/**
 * Keep the Owner contact in step with the client record the office edits.
 * New client: create the Owner from contactNumber + ownerName. Edited client:
 * move the Owner that had the old number to the new one.
 */
export async function syncOwnerContact(client, previousPhone = null) {
  try {
    const ownerRole = await db.clientRole.findFirst({ where: { isSystem: true, isDeleted: false } });
    if (!ownerRole) return; // roles not seeded yet — the backfill script creates the Owners
    const phone = normalizePhone(client.contactNumber);
    const owner = await db.clientContact.findFirst({
      where: { clientId: client.id, roleId: ownerRole.id, isDeleted: false, phone: normalizePhone(previousPhone ?? client.contactNumber) },
    });
    const clash = await db.clientContact.findFirst({
      where: { phone, isDeleted: false, ...(owner && { id: { not: owner.id } }) },
      select: { clientId: true },
    });
    if (clash) {
      logger.warn(`Owner contact for ${client.clientId} not synced: ${phone} is already a contact of client ${clash.clientId}`);
      return;
    }
    if (owner) {
      await db.clientContact.update({ where: { id: owner.id }, data: { phone, name: client.ownerName } });
    } else if (!previousPhone) {
      await db.clientContact.create({
        data: { clientId: client.id, name: client.ownerName, phone, roleId: ownerRole.id, createdByType: 'SYSTEM', createdById: 'client-record' },
      });
    }
  } catch (error) {
    // The client record is saved either way; the office can fix the Team tab.
    logger.error(`syncOwnerContact ${client.clientId}: ${error.message}`);
  }
}
