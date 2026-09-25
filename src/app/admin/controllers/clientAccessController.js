import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import { CLIENT_MODULES, CLIENT_PERMISSIONS, sanitizeClientPermissions } from '../../../helper/clientAccess.js';
import { listContacts, saveContact, removeContact } from '../../../helper/clientContacts.js';

/**
 * Panel side of docs/06: the Client Roles module and a client's Team tab.
 * Responses mirror roleController so the panel reuses its Roles screen.
 */

function handle(res, error, where) {
  if (error.status) return res.status(error.status).json({ success: false, message: error.message, data: null });
  logger.error(`${where} error:`, error);
  return res.status(500).json({ success: false, message: 'Internal Server Error', data: null });
}

const serializeRole = (r) => ({
  id: r.id,
  name: r.name,
  description: r.description,
  isSystem: r.isSystem,
  isActive: r.isActive,
  permissions: r.isSystem ? CLIENT_PERMISSIONS : r.permissions.map((p) => p.permission),
  userCount: r._count?.contacts ?? 0,
});

const roleInclude = {
  permissions: { select: { permission: true } },
  _count: { select: { contacts: { where: { isDeleted: false } } } },
};

// ─── Client roles ───────────────────────────────────────────────────────────

export async function getCatalog(req, res) {
  const modules = CLIENT_MODULES.map((m) => ({ ...m, actions: m.actions.map((a) => ({ action: a, key: `${m.key}.${a}` })) }));
  return res.status(200).json({ success: true, data: { modules, all: CLIENT_PERMISSIONS } });
}

export async function listRoles(req, res) {
  try {
    const roles = await db.clientRole.findMany({
      where: { isDeleted: false },
      include: roleInclude,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    return res.status(200).json({ success: true, data: roles.map(serializeRole) });
  } catch (error) {
    return handle(res, error, 'listClientRoles');
  }
}

export async function createRole(req, res) {
  try {
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(422).json({ success: false, message: 'Role name is required', data: null });
    if (await db.clientRole.findFirst({ where: { name } })) {
      return res.status(409).json({ success: false, message: 'A client role with this name already exists', data: null });
    }
    const role = await db.clientRole.create({
      data: {
        name,
        description: req.body.description ? String(req.body.description).trim() : null,
        isActive: req.body.isActive === undefined ? true : Boolean(req.body.isActive),
        permissions: { create: sanitizeClientPermissions(req.body.permissions).map((permission) => ({ permission })) },
      },
      include: roleInclude,
    });
    return res.status(200).json({ success: true, message: 'Client role created', data: serializeRole(role) });
  } catch (error) {
    return handle(res, error, 'createClientRole');
  }
}

/** Replace a role's details and permissions. Applies to every contact on it at once. */
export async function updateRole(req, res) {
  try {
    const id = Number(req.body?.id ?? req.query?.id);
    const existing = await db.clientRole.findFirst({ where: { id, isDeleted: false } });
    if (!existing) return res.status(404).json({ success: false, message: 'Role not found', data: null });
    if (existing.isSystem) {
      return res.status(403).json({ success: false, message: 'The Owner role is built in and cannot be changed', data: null });
    }
    const name = req.body.name !== undefined ? String(req.body.name).trim() : existing.name;
    if (!name) return res.status(422).json({ success: false, message: 'Role name is required', data: null });
    if (name !== existing.name && (await db.clientRole.findFirst({ where: { name, id: { not: id } } }))) {
      return res.status(409).json({ success: false, message: 'A client role with this name already exists', data: null });
    }

    const role = await db.$transaction(async (tx) => {
      if (req.body.permissions !== undefined) {
        await tx.clientRolePermission.deleteMany({ where: { roleId: id } });
        await tx.clientRolePermission.createMany({
          data: sanitizeClientPermissions(req.body.permissions).map((permission) => ({ roleId: id, permission })),
        });
      }
      return tx.clientRole.update({
        where: { id },
        data: {
          name,
          ...(req.body.description !== undefined && { description: String(req.body.description).trim() || null }),
          ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) }),
        },
        include: roleInclude,
      });
    });
    return res.status(200).json({ success: true, message: 'Client role updated', data: serializeRole(role) });
  } catch (error) {
    return handle(res, error, 'updateClientRole');
  }
}

export async function deleteRole(req, res) {
  try {
    const id = Number(req.query?.id ?? req.body?.id);
    const role = await db.clientRole.findFirst({ where: { id, isDeleted: false }, include: roleInclude });
    if (!role) return res.status(404).json({ success: false, message: 'Role not found', data: null });
    if (role.isSystem) return res.status(403).json({ success: false, message: 'The Owner role cannot be deleted', data: null });
    if (role._count.contacts > 0) {
      return res.status(409).json({ success: false, message: `${role._count.contacts} contact(s) still use this role — move them first`, data: null });
    }
    // Soft delete, renamed so the name can be reused (name is unique).
    await db.clientRole.update({ where: { id }, data: { isDeleted: true, isActive: false, name: `${role.name} (deleted ${id})` } });
    return res.status(200).json({ success: true, message: 'Client role deleted', data: null });
  } catch (error) {
    return handle(res, error, 'deleteClientRole');
  }
}

// ─── A client's contacts (Team tab) ─────────────────────────────────────────

/** Accepts the client code (CL-2026-0010) or the row id. */
async function findClient(req, res) {
  const key = req.params.clientId;
  const client = await db.client.findFirst({ where: { isDeleted: false, OR: [{ clientId: key }, { id: key }] }, select: { id: true } });
  if (!client) res.status(404).json({ success: false, message: 'Client not found', data: null });
  return client;
}

const officeActor = (req) => ({ type: 'USER', id: Number(req.user?.data?.id), canAssignOwner: true });

export async function listClientContacts(req, res) {
  try {
    const client = await findClient(req, res);
    if (!client) return;
    return res.status(200).json({ success: true, data: await listContacts(client.id) });
  } catch (error) {
    return handle(res, error, 'listClientContacts');
  }
}

export async function createClientContact(req, res) {
  try {
    const client = await findClient(req, res);
    if (!client) return;
    const data = await saveContact(client.id, req.body ?? {}, officeActor(req));
    return res.status(201).json({ success: true, message: 'Contact added', data });
  } catch (error) {
    return handle(res, error, 'createClientContact');
  }
}

export async function updateClientContact(req, res) {
  try {
    const client = await findClient(req, res);
    if (!client) return;
    const data = await saveContact(client.id, req.body ?? {}, officeActor(req), req.params.contactId);
    return res.status(200).json({ success: true, message: 'Contact saved', data });
  } catch (error) {
    return handle(res, error, 'updateClientContact');
  }
}

export async function deleteClientContact(req, res) {
  try {
    const client = await findClient(req, res);
    if (!client) return;
    await removeContact(client.id, req.params.contactId, officeActor(req));
    return res.status(200).json({ success: true, message: 'Contact removed', data: null });
  } catch (error) {
    return handle(res, error, 'deleteClientContact');
  }
}
