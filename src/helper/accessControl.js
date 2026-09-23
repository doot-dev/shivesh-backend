import db from '../config/database.js';
import logger from '../helper/logger.js';
import {
  ALL_PERMISSIONS,
  modulesFromPermissions,
  permissionKey,
  ACTIONS,
} from '../config/permissions.js';

/**
 * Resolves what a user is actually allowed to do, and enforces it on routes.
 *
 * Permissions are ALWAYS resolved from the database on each request, never read
 * from the JWT. The token is long-lived (30 days), so baking grants into it
 * would mean revoking access did nothing until the user happened to log in
 * again — a fired employee would keep their access for a month.
 */

/**
 * Effective permissions for one user: role grants, then per-user overrides.
 *
 * Precedence is deliberately simple and total:
 *   1. isSuperAdmin  -> everything, full stop.
 *   2. role grants   -> the baseline.
 *   3. user ALLOW    -> adds a permission the role lacks.
 *   4. user DENY     -> removes it, and beats both the role AND an ALLOW.
 *
 * Returns null when the user no longer exists, is deleted, or is inactive —
 * callers treat that as "session is dead", not "has no permissions".
 */
export async function resolveUserAccess(userId) {
  const user = await db.user.findFirst({
    where: { id: Number(userId), isDeleted: false },
    select: {
      id: true,
      name: true,
      userName: true,
      employeeId: true,
      role: true,
      status: true,
      isSuperAdmin: true,
      roleId: true,
      roleRef: {
        select: {
          id: true,
          name: true,
          isActive: true,
          isDeleted: true,
          isSystem: true,
          permissions: { select: { permission: true } },
        },
      },
      permissionOverrides: { select: { permission: true, effect: true } },
    },
  });

  if (!user || !user.status) return null;

  if (user.isSuperAdmin) {
    return {
      user,
      isSuperAdmin: true,
      roleName: user.roleRef?.name ?? 'Super Admin',
      permissions: [...ALL_PERMISSIONS],
      modules: modulesFromPermissions(ALL_PERMISSIONS),
    };
  }

  // A role that has been deactivated or deleted grants nothing. Doing this here
  // rather than filtering in the query means turning a role off instantly
  // removes access for everyone on it, without touching their user rows.
  const roleIsUsable = user.roleRef && user.roleRef.isActive && !user.roleRef.isDeleted;
  const granted = new Set(
    roleIsUsable ? user.roleRef.permissions.map((p) => p.permission) : [],
  );

  for (const override of user.permissionOverrides) {
    if (override.effect === 'ALLOW') granted.add(override.permission);
  }
  // DENY runs in its own pass AFTER ALLOW so order of rows can never change the
  // outcome — a deny is a deny regardless of what else was added.
  for (const override of user.permissionOverrides) {
    if (override.effect === 'DENY') granted.delete(override.permission);
  }

  const permissions = [...granted];
  return {
    user,
    isSuperAdmin: false,
    roleName: roleIsUsable ? user.roleRef.name : null,
    permissions,
    modules: modulesFromPermissions(permissions),
  };
}

/**
 * Express middleware factory: blocks the request unless the caller holds the
 * permission. Mount it AFTER verifyToken — it reads `req.user.data.id`.
 *
 * On success it hangs `req.access` on the request so a controller can make
 * finer-grained decisions without a second database round-trip.
 *
 *   router.post('/', verifyToken, requirePermission('orders.create'), createOrder);
 */
export function requirePermission(...required) {
  const needed = required.flat().filter(Boolean);

  return async function permissionGate(req, res, next) {
    try {
      const userId = req.user?.data?.id;
      if (!userId) {
        return res
          .status(401)
          .json({ success: false, message: 'Not authenticated', data: null });
      }

      const access = await resolveUserAccess(userId);
      if (!access) {
        return res.status(401).json({
          success: false,
          message: 'Your account is inactive or no longer exists',
          data: null,
        });
      }

      req.access = access;

      // Holding ANY of the listed permissions is enough. Routes that serve two
      // jobs (e.g. a lookup used by both Orders and Billing) list both rather
      // than being left unguarded.
      const held = new Set(access.permissions);
      if (needed.length === 0 || needed.some((p) => held.has(p))) {
        return next();
      }

      logger.warn(
        `Access denied: user ${userId} (${access.user.userName}) lacks ${needed.join(' | ')} for ${req.method} ${req.originalUrl}`,
      );
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action',
        data: { required: needed },
      });
    } catch (error) {
      logger.error('requirePermission error:', error);
      return res
        .status(500)
        .json({ success: false, message: 'Permission check failed', data: null });
    }
  };
}

/**
 * Guard for endpoints only a super admin may call.
 * Used where a narrower permission would still be too much power to delegate.
 */
export async function requireSuperAdmin(req, res, next) {
  try {
    const userId = req.user?.data?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated', data: null });
    }

    const access = await resolveUserAccess(userId);
    if (!access) {
      return res.status(401).json({
        success: false,
        message: 'Your account is inactive or no longer exists',
        data: null,
      });
    }

    req.access = access;
    if (!access.isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Only a super admin can perform this action',
        data: null,
      });
    }
    return next();
  } catch (error) {
    logger.error('requireSuperAdmin error:', error);
    return res.status(500).json({ success: false, message: 'Permission check failed', data: null });
  }
}

/** Convenience for controller-level checks once `req.access` is populated. */
export function hasPermission(access, key) {
  if (!access) return false;
  if (access.isSuperAdmin) return true;
  return access.permissions.includes(key);
}

/**
 * Keys in `requested` the caller does not hold themselves.
 *
 * A non-super-admin may only hand out what they already have. Without this,
 * users.update or roles.update is a path to everything: ALLOW yourself
 * roles.update, or add billing.approve to your own role.
 */
export function ungrantable(access, requested) {
  if (access?.isSuperAdmin) return [];
  const held = new Set(access?.permissions ?? []);
  return requested.filter((p) => !held.has(p));
}

/** Same check for assigning a whole role: every grant on it must be grantable. */
export async function ungrantableRole(access, roleId) {
  if (!roleId || access?.isSuperAdmin) return [];
  const grants = await db.rolePermission.findMany({
    where: { roleId },
    select: { permission: true },
  });
  return ungrantable(access, grants.map((g) => g.permission));
}

/** Shorthand builder so route files read as `can('orders', 'create')`. */
export function can(moduleKey, action = ACTIONS.VIEW) {
  return permissionKey(moduleKey, action);
}
