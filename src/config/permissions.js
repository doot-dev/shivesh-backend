/**
 * The permission catalog — the single source of truth for what can be secured
 * in the admin panel.
 *
 * A permission key is always `<module>.<action>`, e.g. "orders.create". Modules
 * map 1:1 onto sidebar entries, which is what lets the panel build its menu
 * straight from the permissions a user holds instead of hardcoding a list.
 *
 * The panel has its own mirror of this file at
 * `shivesh-admin-panel/src/constant/permissions.js`. If you add a module or an
 * action here, add it there too — the panel renders the permission matrix from
 * its copy, and the backend enforces from this one.
 *
 * `view` is special: it is the permission to open the module at all. Every
 * other action implies nothing on its own — a user with "orders.create" but no
 * "orders.view" cannot reach the Orders page, so the UI always grants view
 * alongside anything else.
 */

/** Every action verb a module can expose. */
export const ACTIONS = {
  VIEW: 'view',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  EXPORT: 'export',
  APPROVE: 'approve',
};

const CRUD = [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.UPDATE, ACTIONS.DELETE];
const VIEW_ONLY = [ACTIONS.VIEW];

/**
 * Module definitions, in sidebar order.
 *
 * `path` is the panel route the module guards, and it is what the sidebar and
 * the route guard both key off — keep it in sync with appRoutes.jsx.
 */
export const MODULES = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    description: 'Business overview and headline numbers.',
    actions: VIEW_ONLY,
  },
  {
    key: 'users',
    label: 'Users',
    path: '/users',
    description: 'Panel and technician accounts.',
    actions: CRUD,
  },
  {
    key: 'roles',
    label: 'Roles & Permissions',
    path: '/roles',
    description: 'Who can see and do what. Grant carefully.',
    actions: CRUD,
  },
  {
    // docs/06: the client app's roles (Owner, Site Engineer …), not panel roles.
    key: 'clientRoles',
    label: 'Client Roles',
    path: '/client-roles',
    description: 'Roles for client-app users and what each may do.',
    actions: CRUD,
  },
  {
    key: 'products',
    label: 'Product',
    path: '/products',
    description: 'Product and grade master.',
    actions: CRUD,
  },
  {
    key: 'subcategories',
    label: 'Sub-category',
    path: '/subcategories',
    description: 'Sub-category master list.',
    actions: CRUD,
  },
  {
    key: 'clients',
    label: 'Client',
    path: '/clients',
    description: 'Client records and KYC documents.',
    actions: CRUD,
  },
  {
    key: 'clientKyc',
    parent: 'clients',
    label: 'Client · KYC documents',
    path: null,
    description: 'See, upload and delete KYC files.',
    actions: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.DELETE],
  },
  {
    key: 'clientTeam',
    parent: 'clients',
    label: 'Client · App users',
    path: null,
    description: "The client's own app logins (Owner, site engineers, accounts).",
    actions: CRUD,
  },
  {
    key: 'clientCredit',
    parent: 'clients',
    label: 'Client · Credit terms',
    path: null,
    description: 'Credit limit and days.',
    actions: [ACTIONS.VIEW, ACTIONS.UPDATE],
  },
  {
    key: 'vendors',
    label: 'Vendor',
    path: '/vendors',
    description: 'Vendors, plants and handlers.',
    actions: CRUD,
  },
  {
    key: 'vendorPlants',
    parent: 'vendors',
    label: 'Vendor · Plants & handlers',
    path: null,
    description: "A vendor's plants and the people who handle them.",
    actions: CRUD,
  },
  {
    key: 'leads',
    label: 'Leads',
    path: '/leads',
    description: 'Sales pipeline and lead activity.',
    actions: CRUD,
  },
  {
    key: 'projects',
    label: 'Project',
    path: '/projects',
    description: 'Projects, project products and credit terms.',
    actions: CRUD,
  },
  {
    key: 'projectProducts',
    parent: 'projects',
    label: 'Project · Products & prices',
    path: null,
    description: "The project's price list and each line's vendors.",
    actions: CRUD,
  },
  {
    key: 'projectTeam',
    parent: 'projects',
    label: 'Project · Field technicians',
    path: null,
    description: 'Which FTs work the project (they see all its orders).',
    actions: [ACTIONS.VIEW, ACTIONS.UPDATE],
  },
  {
    key: 'projectCommission',
    parent: 'projects',
    label: 'Project · Commission',
    path: null,
    description: 'Commission person and rate.',
    actions: [ACTIONS.VIEW, ACTIONS.UPDATE],
  },
  {
    key: 'orders',
    label: 'Orders & Tracks',
    path: '/orders',
    description: 'Orders, TM dispatch and delivery tracking.',
    actions: [...CRUD, ACTIONS.APPROVE],
  },
  {
    key: 'fieldOrders',
    parent: 'orders',
    label: 'Order · Place from field app',
    path: null,
    description: 'Lets a field technician book orders for their projects in the field app.',
    actions: [ACTIONS.CREATE],
  },
  {
    key: 'orderExtras',
    parent: 'orders',
    label: 'Order · Extra services',
    path: null,
    description: 'Pumping, part load and other charges on an order (delete = remove them).',
    actions: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.DELETE],
  },
  {
    key: 'cubeTests',
    label: 'Cube Testing',
    path: '/testing',
    description: 'Cube test schedules and result sheets.',
    actions: CRUD,
  },
  {
    key: 'billing',
    label: 'Billing',
    path: '/billing',
    description: 'Bills, payment status and challan approval.',
    actions: [...CRUD, ACTIONS.APPROVE],
  },
  {
    // W21: recording money is separate from billing; `delete` = reverse a payment.
    key: 'payments',
    label: 'Payments',
    path: null,
    description: 'Record client payments (cheque / UTR) and reverse them.',
    actions: [ACTIONS.VIEW, ACTIONS.CREATE, ACTIONS.DELETE],
  },
  {
    key: 'creditScore',
    label: 'Credit Score',
    path: null,
    description: 'The green / yellow / orange / red credit bar on clients and orders.',
    actions: VIEW_ONLY,
  },
  {
    key: 'creditAmounts',
    label: 'Credit Amounts',
    path: null,
    description: 'Limit, used and available figures under the credit bar.',
    actions: VIEW_ONLY,
  },
  {
    key: 'reports',
    label: 'Reports',
    path: '/reports',
    description: 'Credit risk and other management reports.',
    actions: [ACTIONS.VIEW, ACTIONS.EXPORT],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    path: null,
    description: 'The in-panel notification bell.',
    actions: VIEW_ONLY,
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/settings',
    description: 'Panel configuration.',
    actions: [ACTIONS.VIEW, ACTIONS.UPDATE],
  },
];

/** Build "module.action" from its parts. Use this instead of string literals. */
export function permissionKey(moduleKey, action) {
  return `${moduleKey}.${action}`;
}

/** Every valid permission key, flat. */
export const ALL_PERMISSIONS = MODULES.flatMap((m) =>
  m.actions.map((a) => permissionKey(m.key, a)),
);

const ALL_PERMISSIONS_SET = new Set(ALL_PERMISSIONS);

/**
 * True when `key` is a permission this build actually knows about.
 *
 * Used to reject unknown keys at the API edge: without it, a typo like
 * "order.create" would be stored happily and then silently never match,
 * producing a role that looks granted in the UI but denies in practice.
 */
export function isValidPermission(key) {
  return ALL_PERMISSIONS_SET.has(key);
}

/** Drop anything unknown from a submitted list, de-duplicated. */
export function sanitizePermissions(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((k) => typeof k === 'string' && isValidPermission(k)))];
}

/** Module keys a permission list can open, in catalog order. */
export function modulesFromPermissions(permissions) {
  const held = new Set(permissions);
  return MODULES.filter((m) => held.has(permissionKey(m.key, ACTIONS.VIEW))).map((m) => m.key);
}

/**
 * Shape the catalog for the panel's permission matrix, so the UI never has to
 * hardcode which actions a module supports.
 */
export function permissionCatalog() {
  return MODULES.map((m) => ({
    key: m.key,
    parent: m.parent ?? null,
    label: m.label,
    path: m.path,
    description: m.description,
    actions: m.actions.map((a) => ({ action: a, key: permissionKey(m.key, a) })),
  }));
}
