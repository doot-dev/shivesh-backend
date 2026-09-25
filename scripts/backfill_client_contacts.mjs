// Client team access (docs/06, migration 012). Safe to re-run:
//   1. the starter client roles (Owner, Site Engineer, Accounts, Viewer) — an
//      existing role is left as the office edited it;
//   2. an Owner contact for every client, from contactNumber + ownerName, so
//      every existing login keeps working;
//   3. push tokens registered to a client move to its Owner contact.
//   --demo  Sahyadri (CL-2026-0010) also gets a site engineer (9000000333, the
//           Hinjewadi project only) and an accounts person (9000000444).
//
//   node scripts/backfill_client_contacts.mjs [--demo]
import db from '../src/config/database.js';
import { STARTER_ROLES, normalizePhone } from '../src/helper/clientAccess.js';
import { saveContact } from '../src/helper/clientContacts.js';

const SYSTEM = { type: 'SYSTEM', id: 'backfill-012', canAssignOwner: true };

for (const r of STARTER_ROLES) {
  if (await db.clientRole.findFirst({ where: { name: r.name } })) continue;
  await db.clientRole.create({
    data: {
      name: r.name,
      description: r.description,
      isSystem: Boolean(r.isSystem),
      // The Owner's permissions are implied (always everything), not stored.
      permissions: { create: r.isSystem ? [] : r.permissions.map((permission) => ({ permission })) },
    },
  });
  console.log(`role created: ${r.name}`);
}

const ownerRole = await db.clientRole.findFirst({ where: { isSystem: true, isDeleted: false } });
const clients = await db.client.findMany({ where: { isDeleted: false }, orderBy: { createdAt: 'asc' } });

for (const c of clients) {
  let owner = await db.clientContact.findFirst({ where: { clientId: c.id, roleId: ownerRole.id, isDeleted: false } });
  if (!owner) {
    const phone = normalizePhone(c.contactNumber);
    const clash = await db.clientContact.findFirst({ where: { phone, isDeleted: false }, include: { client: true } });
    if (clash) {
      console.warn(`SKIP ${c.clientId}: ${phone} is already a contact of ${clash.client.clientId} (Q6: one number, one company)`);
      continue;
    }
    owner = await db.clientContact.create({
      data: { clientId: c.id, name: c.ownerName, phone, roleId: ownerRole.id, createdByType: SYSTEM.type, createdById: SYSTEM.id },
    });
    console.log(`owner contact: ${c.clientId} ${c.ownerName} ${phone}`);
  }
  const moved = await db.deviceToken.updateMany({
    where: { targetType: 'CLIENT', targetId: c.id },
    data: { targetType: 'CLIENT_CONTACT', targetId: owner.id },
  });
  if (moved.count) console.log(`  ${moved.count} device token(s) moved to the owner`);
}

if (process.argv.includes('--demo')) {
  const sahyadri = await db.client.findFirst({ where: { clientId: 'CL-2026-0010' } });
  const roleId = async (name) => (await db.clientRole.findFirst({ where: { name } })).id;
  const demo = [
    { name: 'Rakesh Pawar', phone: '9000000333', designation: 'Site Engineer', roleId: await roleId('Site Engineer'), allProjects: false, projects: ['PRJ-2026-0024'] },
    { name: 'Sneha Kulkarni', phone: '9000000444', designation: 'Accounts', roleId: await roleId('Accounts'), allProjects: true },
  ];
  for (const d of demo) {
    try {
      const saved = await saveContact(sahyadri.id, d, SYSTEM);
      console.log(`demo contact: ${saved.name} ${saved.phone} ${saved.role.name}`);
    } catch (e) {
      console.log(`demo contact ${d.phone}: ${e.message}`);
    }
  }
}

console.log(`done: ${await db.clientContact.count({ where: { isDeleted: false } })} contacts, ${await db.clientRole.count({ where: { isDeleted: false } })} roles`);
await db.$disconnect();
