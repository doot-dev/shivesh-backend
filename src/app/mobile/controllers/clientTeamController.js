import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { describeAccess } from '../../../helper/clientAccess.js';
import { listContacts, saveContact, removeContact } from '../../../helper/clientContacts.js';

/**
 * The signed-in contact and their company's team (docs/06). Everything except
 * /me needs `team.manage`; the owner in the app can add any role but Owner.
 */

const actorOf = (req) => ({ type: 'CLIENT_CONTACT', id: req.clientAccess.contact?.id, canAssignOwner: false });

function handle(res, error, where) {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message });
  logger.error(`${where} error:`, error);
  return res.status(500).json({ success: false, message: 'Internal Server Error' });
}

/** GET /client/me — who I am, my role, what I may do, which projects I see. */
export async function me(req, res) {
  return res.status(200).json({ success: true, data: describeAccess(req.clientAccess) });
}

export async function listTeam(req, res) {
  try {
    return res.status(200).json({ success: true, data: await listContacts(req.user.data.id) });
  } catch (error) {
    return handle(res, error, 'listTeam');
  }
}

/** Roles the owner may hand out, with what each allows (so the app can explain them). */
export async function listRoles(req, res) {
  try {
    const roles = await db.clientRole.findMany({
      where: { isDeleted: false, isActive: true, isSystem: false },
      include: { permissions: { select: { permission: true } } },
      orderBy: { name: 'asc' },
    });
    const data = roles.map((r) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions.map((p) => p.permission) }));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return handle(res, error, 'listRoles');
  }
}

export async function addMember(req, res) {
  try {
    if (!req.clientAccess.contact) return res.status(403).json({ success: false, message: 'Not available for this account' });
    const data = await saveContact(req.user.data.id, req.body ?? {}, actorOf(req));
    return res.status(201).json({ success: true, message: 'Added to your team', data });
  } catch (error) {
    return handle(res, error, 'addMember');
  }
}

export async function updateMember(req, res) {
  try {
    if (!req.clientAccess.contact) return res.status(403).json({ success: false, message: 'Not available for this account' });
    const data = await saveContact(req.user.data.id, req.body ?? {}, actorOf(req), req.params.contactId);
    return res.status(200).json({ success: true, message: 'Saved', data });
  } catch (error) {
    return handle(res, error, 'updateMember');
  }
}

export async function removeMember(req, res) {
  try {
    if (!req.clientAccess.contact) return res.status(403).json({ success: false, message: 'Not available for this account' });
    await removeContact(req.user.data.id, req.params.contactId, actorOf(req));
    return res.status(200).json({ success: true, message: 'Removed from your team' });
  } catch (error) {
    return handle(res, error, 'removeMember');
  }
}
