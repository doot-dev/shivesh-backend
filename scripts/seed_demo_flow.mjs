// Prepares "Demo Constructions" for a client walkthrough (docs/demo-script.md):
// credit ₹10 L / 30 days, KYC verified, RMC M25 @ ₹5,200 priced on its project.
// Safe to re-run.
import db from '../src/config/database.js';

const client = await db.client.findFirst({ where: { companyName: { contains: 'Demo Constructions' }, isDeleted: false }, include: { projects: true } });
if (!client) { console.error('Demo client not found'); process.exit(1); }
await db.client.update({ where: { id: client.id }, data: { creditLimit: 1000000, creditDays: 30, kycStatus: 'VERIFIED', status: 'ACTIVE' } });
const project = client.projects[0];
await db.project.update({ where: { id: project.id }, data: { status: 'ACTIVE' } });
const exists = await db.projectProduct.findFirst({ where: { projectId: project.id, productName: 'RMC', productGrade: 'M25' } });
if (!exists) await db.projectProduct.create({ data: { projectId: project.id, productName: 'RMC', productGrade: 'M25', costPrice: 5200 } });
console.log(JSON.stringify({ client: client.clientId, phone: client.contactNumber, project: project.projectId, product: 'RMC M25 @ ₹5,200 / CBM', credit: '₹10,00,000 / 30 days' }));
process.exit(0);
