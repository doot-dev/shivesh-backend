import db from '../../../config/database.js';
import logger from '../../../helper/logger.js';
import {
  permissionCatalog,
  sanitizePermissions,
  ALL_PERMISSIONS,
} from '../../../config/permissions.js';
import { resolveUserAccess, ungrantable } from '../../../helper/accessControl.js';

function cannotGrant(res, missing) {
  return res.status(403).json({
    success: false,
    message: 'You cannot grant permissions you do not hold yourself',
    data: { missing },
  });
}

/**
 * Role & permission administration for the web panel.
 *
 * Two invariants are enforced here rather than in the UI, because the UI can be
 * bypassed with a direct API call:
 *   - a system role (Super Admin) can never be edited or deleted;
 *   - a role that still has users on it can never be deleted.
 * Both exist to stop an admin locking the whole team out of the panel.
 */

/** Shape a Role row for the panel, with its grants flattened to a string list. */
function serializeRole(role, userCount = undefined) {
  return {
    id: role.id,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    isActive: role.isActive,
    permissions: role.permissions?.map((p) => p.permission) ?? [],
    userCount: userCount ?? role._count?.users ?? 0,
    createdAt: role.createdAt,
    updatedAt: role.updatedAt,
  };
}

/**
 * The permission catalog — every module and action the panel can secure.
 * The Roles screen renders its matrix from this, so the UI never hardcodes it.
 */
export async function getPermissionCatalog(req, res) {
  try {
    return res.status(200).json({
      success: true,
      message: 'Permission catalog retrieved successfully',
      data: { modules: permissionCatalog(), all: ALL_PERMISSIONS },
    });
  } catch (error) {
    logger.error('getPermissionCatalog error:', error);
    return res.status(500).json({ success: false, message: error.message, data: null });
  }
}

/** All roles with their grants and how many users sit on each. */
export async function getAllRoles(req, res) {
  try {
    const roles = await db.role.findMany({
      where: { isDeleted: false },
      include: {
        permissions: { select: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return res.status(200).json({
      success: true,
      message: 'Roles retrieved successfully',
      data: roles.map((r) => serializeRole(r)),
    });
  } catch (error) {
    logger.error('getAllRoles error:', error);
    return res.status(400).json({ success: false, message: error.message, data: null });
  }
}

/** One role, including the users currently assigned to it. */
export async function getRole(req, res) {
  try {
    const id = Number(req.query?.id ?? req.params?.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Role ID is required', data: null });
    }

    const role = await db.role.findFirst({
      where: { id, isDeleted: false },
      include: {
        permissions: { select: { permission: true } },
        users: {
          where: { isDeleted: false },
          select: { id: true, name: true, userName: true, employeeId: true, status: true },
        },
      },
    });

    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found', data: null });
    }

    return res.status(200).json({
      success: true,
      message: 'Role retrieved successfully',
      data: { ...serializeRole(role, role.users.length), users: role.users },
    });
  } catch (error) {
    logger.error('getRole error:', error);
    return res.status(400).json({ success: false, message: error.message, data: null });
  }
}

/** Create a role and its grants in one transaction. */
export async function createRole(req, res) {
  try {
    const { name, description, permissions, isActive } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(422).json({ success: false, message: 'Role name is required', data: null });
    }

    const trimmed = String(name).trim();
    const duplicate = await db.role.findFirst({ where: { name: trimmed, isDeleted: false } });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'A role with this name already exists', data: null });
    }

    // Unknown keys are dropped rather than rejected: the panel may be a version
    // behind the backend, and silently ignoring a retired permission is safer
    // than failing the whole save.
    const clean = sanitizePermissions(permissions);
    const missing = ungrantable(req.access, clean);
    if (missing.length) return cannotGrant(res, missing);

    const role = await db.role.create({
      data: {
        name: trimmed,
        description: description ? String(description).trim() : null,
        isActive: isActive === undefined ? true : Boolean(isActive),
        permissions: { create: clean.map((permission) => ({ permission })) },
      },
      include: { permissions: { select: { permission: true } } },
    });

    return res.status(200).json({
      success: true,
      message: 'Role created successfully',
      data: serializeRole(role, 0),
    });
  } catch (error) {
    logger.error('createRole error:', error);
    return res.status(400).json({ success: false, message: error.message, data: null });
  }
}

/**
 * Update a role's details and REPLACE its permission set.
 *
 * The grants are deleted and re-created rather than diffed: the panel always
 * submits the complete list, so a replace cannot leave a stale grant behind.
 */
export async function updateRole(req, res) {
  try {
    const id = Number(req.body?.id ?? req.query?.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Role ID is required', data: null });
    }

    const existing = await db.role.findFirst({ where: { id, isDeleted: false } });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Role not found', data: null });
    }

    if (existing.isSystem) {
      return res.status(403).json({
        success: false,
        message: 'The Super Admin role is built in and cannot be changed',
        data: null,
      });
    }

    const { name, description, permissions, isActive } = req.body;

    if (name && String(name).trim() !== existing.name) {
      const duplicate = await db.role.findFirst({
        where: { name: String(name).trim(), isDeleted: false, id: { not: id } },
      });
      if (duplicate) {
        return res.status(409).json({ success: false, message: 'A role with this name already exists', data: null });
      }
    }

    // Only newly ADDED grants are checked, so a limited admin can still trim a
    // role that already holds more than they do.
    let clean;
    if (permissions !== undefined) {
      clean = sanitizePermissions(permissions);
      const current = await db.rolePermission.findMany({ where: { roleId: id }, select: { permission: true } });
      const had = new Set(current.map((p) => p.permission));
      const missing = ungrantable(req.access, clean.filter((p) => !had.has(p)));
      if (missing.length) return cannotGrant(res, missing);
    }

    const data = {};
    if (name !== undefined) data.name = String(name).trim();
    if (description !== undefined) data.description = description ? String(description).trim() : null;
    if (isActive !== undefined) data.isActive = Boolean(isActive);

    const updated = await db.$transaction(async (tx) => {
      await tx.role.update({ where: { id }, data });

      if (clean) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (clean.length) {
          await tx.rolePermission.createMany({
            data: clean.map((permission) => ({ roleId: id, permission })),
          });
        }
      }

      return tx.role.findUnique({
        where: { id },
        include: {
          permissions: { select: { permission: true } },
          _count: { select: { users: true } },
        },
      });
    });

    return res.status(200).json({
      success: true,
      message: 'Role updated successfully',
      data: serializeRole(updated),
    });
  } catch (error) {
    logger.error('updateRole error:', error);
    return res.status(400).json({ success: false, message: error.message, data: null });
  }
}

/**
 * Soft-delete a role.
 * Refuses while users are still assigned — otherwise they would silently drop
 * to zero permissions and simply find the panel empty with no explanation.
 */
export async function deleteRole(req, res) {
  try {
    const id = Number(req.query?.id ?? req.body?.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: 'Role ID is required', data: null });
    }

    const existing = await db.role.findFirst({
      where: { id, isDeleted: false },
      include: { _count: { select: { users: true } } },
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Role not found', data: null });
    }

    if (existing.isSystem) {
      return res.status(403).json({
        success: false,
        message: 'The Super Admin role is built in and cannot be deleted',
        data: null,
      });
    }

    const assigned = await db.user.count({ where: { roleId: id, isDeleted: false } });
    if (assigned > 0) {
      return res.status(409).json({
        success: false,
        message: `${assigned} user${assigned === 1 ? ' is' : 's are'} still using this role. Move them to another role first.`,
        data: { userCount: assigned },
      });
    }

    await db.role.update({ where: { id }, data: { isDeleted: true, isActive: false } });

    return res.status(200).json({ success: true, message: 'Role deleted successfully', data: null });
  } catch (error) {
    logger.error('deleteRole error:', error);
    return res.status(400).json({ success: false, message: error.message, data: null });
  }
}

/**
 * Replace a user's per-user ALLOW/DENY exceptions.
 * Body: { userId, overrides: [{ permission, effect }] }
 */
export async function setUserPermissions(req, res) {
  try {
    const userId = Number(req.body?.userId);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, message: 'User ID is required', data: null });
    }

    const user = await db.user.findFirst({ where: { id: userId, isDeleted: false } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found', data: null });
    }

    const submitted = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    const valid = sanitizePermissions(submitted.map((o) => o?.permission));
    const validSet = new Set(valid);

    // Only a super admin may change a super admin's overrides, and nobody may
    // ALLOW a key they do not hold themselves (DENY is always fine).
    if (user.isSuperAdmin && !req.access?.isSuperAdmin) {
      return res.status(403).json({ success: false, message: 'Only a super admin can edit a super admin', data: null });
    }

    // De-duplicate by permission; a DENY for the same key always wins, matching
    // how resolveUserAccess evaluates them.
    const byPermission = new Map();
    for (const entry of submitted) {
      if (!validSet.has(entry?.permission)) continue;
      const effect = entry?.effect === 'DENY' ? 'DENY' : 'ALLOW';
      if (byPermission.get(entry.permission) === 'DENY') continue;
      byPermission.set(entry.permission, effect);
    }

    const allowed = [...byPermission].filter(([, effect]) => effect === 'ALLOW').map(([p]) => p);
    const missing = ungrantable(req.access, allowed);
    if (missing.length) return cannotGrant(res, missing);

    await db.$transaction(async (tx) => {
      await tx.userPermission.deleteMany({ where: { userId } });
      if (byPermission.size) {
        await tx.userPermission.createMany({
          data: [...byPermission].map(([permission, effect]) => ({ userId, permission, effect })),
        });
      }
    });

    const access = await resolveUserAccess(userId);

    return res.status(200).json({
      success: true,
      message: 'User permissions updated successfully',
      data: {
        userId,
        overrides: [...byPermission].map(([permission, effect]) => ({ permission, effect })),
        effectivePermissions: access?.permissions ?? [],
      },
    });
  } catch (error) {
    logger.error('setUserPermissions error:', error);
    return res.status(400).json({ success: false, message: error.message, data: null });
  }
}

/** A user's role, their overrides, and the effective permissions that result. */
export async function getUserPermissions(req, res) {
  try {
    const userId = Number(req.query?.userId ?? req.query?.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, message: 'User ID is required', data: null });
    }

    const user = await db.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: {
        id: true,
        name: true,
        userName: true,
        roleId: true,
        isSuperAdmin: true,
        roleRef: { select: { id: true, name: true } },
        permissionOverrides: { select: { permission: true, effect: true } },
      },
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found', data: null });
    }

    const access = await resolveUserAccess(userId);

    return res.status(200).json({
      success: true,
      message: 'User permissions retrieved successfully',
      data: {
        userId: user.id,
        name: user.name,
        userName: user.userName,
        roleId: user.roleId,
        roleName: user.roleRef?.name ?? null,
        isSuperAdmin: user.isSuperAdmin,
        rolePermissions: access?.isSuperAdmin ? ALL_PERMISSIONS : undefined,
        overrides: user.permissionOverrides,
        effectivePermissions: access?.permissions ?? [],
      },
    });
  } catch (error) {
    logger.error('getUserPermissions error:', error);
    return res.status(400).json({ success: false, message: error.message, data: null });
  }
}
