import db from '../config/database.js';

/**
 * Client-app access (docs/06-client-team-access.md).
 *
 * A client has many contacts. Each contact logs in with their own phone, holds
 * one client role (Owner, Site Engineer …) and may be limited to some
 * projects. These client permissions are a separate catalog from the panel's
 * `config/permissions.js`.
 */

export const CLIENT_MODULES = [
  { key: 'orders', label: 'Orders', description: 'See, place, cancel and discuss orders.', actions: ['view', 'create', 'cancel', 'comment'] },
  { key: 'trucks', label: 'Trucks', description: 'Reject a truck at site before its challan.', actions: ['reject'] },
  { key: 'cubeTests', label: 'Cube tests', description: 'See cube test results.', actions: ['view'] },
  { key: 'bills', label: 'Bills & invoices', description: 'Bills list and invoice PDFs.', actions: ['view'] },
  { key: 'account', label: 'Credit & statement', description: 'Credit used and available, dues, statement and payments.', actions: ['view'] },
  { key: 'team', label: 'Team', description: "Add and remove the company's own app users.", actions: ['manage'] },
];

export const CLIENT_PERMISSIONS = CLIENT_MODULES.flatMap((m) => m.actions.map((a) => `${m.key}.${a}`));

/** Built-in roles, created by scripts/backfill_client_contacts.mjs. Owner is the locked system role. */
export const STARTER_ROLES = [
  { name: 'Owner', isSystem: true, description: 'Company owner. Always holds everything.', permissions: CLIENT_PERMISSIONS },
  { name: 'Site Engineer', description: 'Places orders and handles trucks at site.', permissions: ['orders.view', 'orders.create', 'orders.comment', 'trucks.reject', 'cubeTests.view'] },
  { name: 'Accounts', description: 'Bills, statement and payments.', permissions: ['orders.view', 'bills.view', 'account.view'] },
  { name: 'Viewer', description: 'Read only: orders and cube tests.', permissions: ['orders.view', 'cubeTests.view'] },
];

/** Drop unknown keys, de-duplicated — same idea as the panel's sanitizePermissions. */
export const sanitizeClientPermissions = (list) =>
  [...new Set((Array.isArray(list) ? list : []).filter((k) => CLIENT_PERMISSIONS.includes(k)))];

/** D16: only KYC-verified clients log in. Switchable for the demo. */
export const requireKyc = () => process.env.CLIENT_LOGIN_REQUIRES_KYC !== 'false';

/** 10-digit Indian mobile, whatever format it was typed or stored in. */
export function normalizePhone(raw) {
  const s = String(raw ?? '').replace(/[\s-]+/g, '').replace(/^\+/, '');
  if (s.startsWith('91') && s.length === 12) return s.slice(2);
  if (s.startsWith('0') && s.length === 11) return s.slice(1);
  return s;
}

/** An active contact, on an active role, of a client that may log in. */
export function activeContactWhere(extra = {}) {
  return {
    isActive: true,
    isDeleted: false,
    role: { isActive: true, isDeleted: false },
    client: { isDeleted: false, status: 'ACTIVE', ...(requireKyc() && { kycStatus: 'VERIFIED' }) },
    ...extra,
  };
}

export const contactInclude = {
  role: { include: { permissions: { select: { permission: true } } } },
  projects: { select: { projectId: true, project: { select: { projectId: true, projectName: true } } } },
  client: { select: { id: true, clientId: true, companyName: true } },
};

/** What a loaded contact may do. `projectIds` null = every project of the client. */
export function toAccess(contact) {
  const permissions = new Set(
    contact.role.isSystem ? CLIENT_PERMISSIONS : contact.role.permissions.map((p) => p.permission),
  );
  const scoped = !contact.allProjects;
  return {
    contact,
    permissions,
    projectIds: scoped ? contact.projects.map((p) => p.projectId) : null,
    projectCodes: scoped ? contact.projects.map((p) => p.project.projectId) : null,
  };
}

const DEV_ACCESS = { contact: null, permissions: new Set(CLIENT_PERMISSIONS), projectIds: null, projectCodes: null };

/**
 * The caller behind a CLIENT token, re-read on every request so a deactivated
 * contact or a changed role takes effect at once. A token from an old app build
 * has no contactId: it acts as the client's Owner. Null = refuse.
 */
export async function loadClientAccess(tokenData) {
  if (tokenData?.id === 'dev-client') return DEV_ACCESS;
  const where = tokenData.contactId
    ? activeContactWhere({ id: tokenData.contactId, clientId: tokenData.id })
    : activeContactWhere({ clientId: tokenData.id, role: { isSystem: true, isActive: true, isDeleted: false } });
  const contact = await db.clientContact.findFirst({ where, include: contactInclude, orderBy: { createdAt: 'asc' } });
  return contact ? toAccess(contact) : null;
}

export const hasClientPermission = (access, key) => Boolean(access?.permissions.has(key));

/** Route guard (any of the keys). The code lets the app tell "role forbids this" from "session dead". */
export const requireClientPermission = (...keys) => (req, res, next) =>
  keys.some((k) => hasClientPermission(req.clientAccess, k))
    ? next()
    : res.status(403).json({ success: false, code: 'ROLE_FORBIDDEN', message: "Your role doesn't allow this — ask your admin" });

/** Project where-fragment: {} for all projects, else only the contact's own. */
export const projectScope = (access) => (access?.projectIds ? { id: { in: access.projectIds } } : {});

/** Order where-fragment limiting to the contact's projects. */
export const orderProjectScope = (access) => (access?.projectIds ? { projectId: { in: access.projectIds } } : {});

// Client notifications about money. Everything else with an order is an order update.
const MONEY_TYPES = ['BILL_STATUS', 'OPS_REMINDER'];

/**
 * May this contact see (and be pushed) a client notification?
 * `order` is { projectId, placedByContactId } or null.
 */
export function contactMaySee(access, { type, order }) {
  const can = (k) => access.permissions.has(k);
  const inScope = !order || !access.projectIds || access.projectIds.includes(order.projectId);
  if (MONEY_TYPES.includes(type)) return (can('bills.view') || can('account.view')) && inScope;
  if (type === 'ORDER_REMINDER') return can('orders.create');
  if (order) return Boolean(access.contact && order.placedByContactId === access.contact.id) || (can('orders.view') && inScope);
  return true;
}

/** Contact ids of a client who should get this notification pushed. */
export async function clientRecipientIds(clientDbId, { type, orderId }) {
  const [contacts, order] = await Promise.all([
    db.clientContact.findMany({ where: activeContactWhere({ clientId: String(clientDbId) }), include: contactInclude }),
    orderId ? db.order.findFirst({ where: { id: orderId }, select: { projectId: true, placedByContactId: true } }) : null,
  ]);
  return contacts.map(toAccess).filter((a) => contactMaySee(a, { type, order })).map((a) => a.contact.id);
}

/** The shape the app builds its menus from (GET /client/me). */
export function describeAccess(access) {
  const c = access.contact;
  return {
    contactId: c?.id ?? null,
    name: c?.name ?? 'Dev Client',
    phone: c?.phone ?? null,
    designation: c?.designation ?? null,
    role: c ? { id: c.role.id, name: c.role.name, isOwner: c.role.isSystem } : { id: 0, name: 'Owner', isOwner: true },
    company: c ? { clientId: c.client.clientId, companyName: c.client.companyName } : null,
    permissions: [...access.permissions],
    allProjects: !access.projectIds,
    projects: c && access.projectIds ? c.projects.map((p) => ({ projectId: p.project.projectId, projectName: p.project.projectName })) : [],
  };
}
