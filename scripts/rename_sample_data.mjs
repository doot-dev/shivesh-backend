// One-off: replace demo/test wording in the dev database with realistic names,
// so the client demo shows no "Demo", "Test" or ".example" records.
// Relations use internal ids, so renaming the CL-/PRJ- codes is safe.
// Back up first. Runs in one transaction; re-running after success fails
// fast on the first missing record and changes nothing.
//
//   node scripts/rename_sample_data.mjs
import db from '../src/config/database.js';

const TEXT = [ // [find, replace] for free-text columns (activity log, notifications, comments)
  ['Demo Constructions Pvt Ltd', 'Sahyadri Infraprojects Pvt Ltd'], ['Curl Test Company', 'Vastu Buildcon LLP'],
  ['Demo Technician', 'Rahul Jadhav'], ['Demo Metro Viaduct', 'Hinjewadi Metro Viaduct Pkg 3'],
  ['Lodha Test 2', 'Lodha Belmondo Tower B'], ['Lodha Test', 'Lodha Belmondo Tower A'],
  ['CL-2025-0004: ₹50000 — system test', 'CL-2025-0004: ₹50000 — Festive season advance'],
  ['unused ₹50000 removed — system test', 'unused ₹50000 removed — Project on hold'],
  ['reversed — system test', 'reversed — Cheque returned by bank'], ['(TEST-000123)', '(004512)'],
];

await db.$transaction(async (tx) => {
  await tx.client.update({ where: { clientId: 'CL-DEMO-1787474987369' }, data: { clientId: 'CL-2026-0010', companyName: 'Sahyadri Infraprojects Pvt Ltd', ownerName: 'Prakash Deshmukh', email: 'prakash.deshmukh@sahyadriinfra.in', address: 'Plot 14, MIDC Bhosari, Pune, Maharashtra 411026' } });
  await tx.client.update({ where: { clientId: 'CL-2025-0004' }, data: { companyName: 'Vastu Buildcon LLP', ownerName: 'Sanjay Kulkarni', email: 'sanjay.kulkarni@vastubuildcon.in', address: 'Office 302, Kalyani Nagar, Pune, Maharashtra 411006' } });
  for (const [clientId, email] of [['CL-2026-0007', 'vinay.shah@marathonnextgen.in'], ['CL-2026-0008', 'kavita.menon@godrejprop.in'], ['CL-2026-0009', 'anil.bhandari@runwalgroup.in'], ['CL-2026-0002', 'girish.sharma@shiveshinfra.in']]) {
    await tx.client.update({ where: { clientId }, data: { email } });
  }

  for (const [projectId, data] of [
    ['PR-DEMO-1787474987369', { projectId: 'PRJ-2026-0024', projectName: 'Hinjewadi Metro Viaduct Pkg 3' }],
    ['PRJ-2026-0001', { projectName: 'Vastu Riverfront Residences', siteName: 'Kharadi, Pune' }],
    ['PRJ-2026-0010', { projectName: 'Runwal Gardens Phase 2', siteName: 'Runwal Gardens Phase 2, Dombivli' }],
    ['PRJ-2026-0011', { projectName: 'Runwal Gardens Phase 3', siteName: 'Runwal Gardens Phase 3, Dombivli' }],
    ['PRJ-2026-0016', { projectName: 'Lodha Belmondo Tower A', siteName: 'Gahunje, Pune' }],
    ['PRJ-2026-0017', { projectName: 'Lodha Belmondo Tower B', siteName: 'Gahunje, Pune' }],
    ['PRJ-2026-0018', { projectName: 'Raunak Maximum City', siteName: 'Thane West' }],
  ]) await tx.project.update({ where: { projectId }, data });

  for (const [userName, data] of [
    ['test1', { name: 'Amit Joshi', userName: 'amit.joshi' }],
    ['test2', { name: 'Neha Patil', userName: 'neha.patil' }],
    ['tesitng', { name: 'Kiran Shinde', userName: 'kiran.shinde' }],
    ['mobiletest', { name: 'Santosh More', userName: 'santosh.more' }],
    ['demo.tech', { name: 'Rahul Jadhav', userName: 'rahul.jadhav', employeeId: 'EMP2005' }],
  ]) {
    const u = await tx.user.findFirstOrThrow({ where: { userName } });
    await tx.user.update({ where: { id: u.id }, data });
  }

  await tx.lead.updateMany({ where: { companyName: 'xyz' }, data: { companyName: 'Kohinoor Developers' } });
  for (const l of await tx.lead.findMany({ where: { email: 'test@gmail.com' } })) {
    const person = l.contactPerson.trim().replace(/^\w/, (x) => x.toUpperCase());
    await tx.lead.update({ where: { id: l.id }, data: { contactPerson: person, email: `${person.toLowerCase().replace(/\s+/g, '.')}${l.id}@gmail.com` } });
  }

  await tx.payment.updateMany({ where: { reference: 'TEST-000123' }, data: { reference: '004512' } });
  await tx.payment.updateMany({ where: { notes: { contains: 'system test' } }, data: { notes: 'Cheque returned by bank — reversed' } });
  await tx.payment.updateMany({ where: { reversalReason: 'system test' }, data: { reversalReason: 'Cheque returned by bank' } });
  await tx.clientCreditExtra.updateMany({ where: { reason: 'system test' }, data: { reason: 'Festive season advance' } });
  await tx.clientCreditExtra.updateMany({ where: { revokeReason: 'system test' }, data: { revokeReason: 'Project on hold' } });

  await tx.orderComment.updateMany({ where: { authorName: 'test1' }, data: { authorName: 'Amit Joshi' } });
  await tx.orderComment.updateMany({ where: { authorName: 'test2' }, data: { authorName: 'Neha Patil' } });
  for (const [start, message] of [['realtime smoke test', 'Please confirm the dispatch time for the first truck.'], ['REALTIME TEST from admin panel', 'Pump is booked for 9:30, please be on time.'], ['sent_after_hittest_fix', 'Second truck has left the plant.']]) {
    await tx.orderComment.updateMany({ where: { message: { startsWith: start } }, data: { message } });
  }

  const names = ['PAN_Card.pdf', 'GST_Certificate.pdf', 'Cancelled_Cheque.pdf', 'Address_Proof.pdf'];
  let k = 0;
  for (const d of await tx.kYCDocument.findMany({ where: { fileName: { in: ['test1.pdf', 'test2.pdf', 'sample.pdf', 'file-sample_150kB.pdf'] } } })) {
    await tx.kYCDocument.update({ where: { id: d.id }, data: { fileName: names[k++ % names.length] } });
  }

  for (const [a, b] of TEXT) {
    await tx.$executeRawUnsafe('UPDATE Activity SET description = REPLACE(description, ?, ?), title = REPLACE(title, ?, ?)', a, b, a, b);
    await tx.$executeRawUnsafe('UPDATE Notification SET message = REPLACE(message, ?, ?), title = REPLACE(title, ?, ?)', a, b, a, b);
    await tx.$executeRawUnsafe('UPDATE OrderComment SET authorName = REPLACE(authorName, ?, ?), message = REPLACE(message, ?, ?)', a, b, a, b);
  }
}, { timeout: 60000 });

console.log('Renamed. Client login unchanged (9000000111); field tech login is now rahul.jadhav.');
process.exit(0);
