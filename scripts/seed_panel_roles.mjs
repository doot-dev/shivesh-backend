// Create the Accountant and Project Manager access roles and put every user of
// that job (who has no access role yet) on them. Without a role those users
// sign in to an empty "No access yet" screen. Safe to re-run: existing roles
// get their grants topped up, users who already have a role are left alone.
//
//   node scripts/seed_panel_roles.mjs
import db from '../src/config/database.js';
import { sanitizePermissions } from '../src/config/permissions.js';

const ROLES = [
  {
    name: 'Accountant',
    job: 'ACCOUNTANT',
    description: 'Bills, payments, client accounts and reports.',
    permissions: [
      'dashboard.view', 'notifications.view',
      'clients.view', 'projects.view', 'orders.view', 'cubeTests.view',
      'billing.view', 'billing.create', 'billing.update', 'billing.approve',
      'payments.view', 'payments.create', 'payments.delete',
      'reports.view', 'reports.export',
    ],
  },
  {
    name: 'Project Manager',
    job: 'PROJECT_MANAGER',
    description: 'Orders, trucks, projects and cube tests; approves credit holds (D12).',
    permissions: [
      'dashboard.view', 'notifications.view',
      'clients.view', 'vendors.view', 'leads.view', 'leads.create', 'leads.update',
      'projects.view', 'projects.create', 'projects.update',
      'orders.view', 'orders.create', 'orders.update', 'orders.approve',
      'cubeTests.view', 'cubeTests.create', 'cubeTests.update',
      'billing.view', 'reports.view',
    ],
  },
];

for (const r of ROLES) {
  const permissions = sanitizePermissions(r.permissions);
  if (permissions.length !== r.permissions.length) throw new Error(`Unknown permission in ${r.name}`);

  const role = await db.role.upsert({
    where: { name: r.name },
    update: {},
    create: { name: r.name, description: r.description },
  });
  await db.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: role.id, permission })),
    skipDuplicates: true,
  });
  const { count } = await db.user.updateMany({
    where: { role: r.job, roleId: null, isSuperAdmin: false, isDeleted: false },
    data: { roleId: role.id },
  });
  console.log(`${r.name}: role #${role.id}, ${permissions.length} permissions, ${count} user(s) assigned`);
}
process.exit(0);
