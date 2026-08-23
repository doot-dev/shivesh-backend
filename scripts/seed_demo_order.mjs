/**
 * Seeds a REAL, walkthrough-ready order for the field-technician (FT) mobile app.
 *
 * Unlike the verify_* scripts, this leaves its data BEHIND on purpose: it exists so
 * a human can open the FT app on an emulator and actually see and touch an order.
 *
 * What it does, in order:
 *   1. Ensures a demo client exists (reachable over real HTTP rather than by
 *      poking the database directly).
 *   2. Logs in as that client with the OTP flow and creates the order through
 *      POST /client/orders — the same endpoint the customer app calls. This is
 *      the important part: the order is created by the client, not fabricated
 *      in the database.
 *   3. Assigns the order to a field technician and gives that technician a known
 *      password, so the FT app can log in and see the order.
 *
 * Prints the exact demo credentials at the end.
 *
 *   node scripts/seed_demo_order.mjs
 *
 * Re-running is safe: it reuses the demo client/technician and adds a fresh order.
 */
import db from '../src/config/database.js';
import { hashPassword } from '../src/helper/passwordHelper.js';

const BASE = `http://localhost:${process.env.PORT || 3001}/api/v1/mobile`;

// Known demo credentials — printed at the end for the walkthrough.
const TECH_USERNAME = 'demo.tech';
const TECH_PASSWORD = 'Demo@12345';

// Clients sign in with their number + OTP only; there is no client password.
// This must match FIXED_CLIENT_OTP in clientAuthController.js.
const CLIENT_PHONE = '9000000111';
const CLIENT_OTP = '1111';

const STAMP = Date.now();

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { authorization: token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

try {
  // ── 1. Demo CLIENT (number + OTP login) ────────────────────────────────────
  step('Ensuring demo client exists');

  let client = await db.client.findFirst({
    where: { contactNumber: CLIENT_PHONE, isDeleted: false },
  });

  if (!client) {
    client = await db.client.create({
      data: {
        clientId: `CL-DEMO-${STAMP}`,
        companyName: 'Demo Constructions Pvt Ltd',
        ownerName: 'Demo Owner',
        contactNumber: CLIENT_PHONE,
        email: `demo_client_${STAMP}@example.test`,
        address: 'Plot 14, Demo Industrial Area, Pune',
      },
    });
    console.log(`   created client ${client.clientId} (${client.companyName})`);
  } else {
    // The OTP flow only serves ACTIVE clients, so make sure a reused row is one.
    if (client.status !== 'ACTIVE') {
      await db.client.update({
        where: { id: client.id },
        data: { status: 'ACTIVE' },
      });
    }
    console.log(`   reusing client ${client.clientId} (${client.companyName})`);
  }

  // ── 2. A project for that client (orders hang off a project) ───────────────
  step('Ensuring demo project exists');

  let project = await db.project.findFirst({
    where: { clientId: client.id, isDeleted: false },
  });

  if (!project) {
    project = await db.project.create({
      data: {
        projectId: `PR-DEMO-${STAMP}`,
        projectName: 'Demo Metro Viaduct',
        clientId: client.id,
        siteName: 'Hinjewadi Site A',
        projectLocation: 'Hinjewadi, Pune',
        projectManager: 'R. Deshmukh',
        address: 'Hinjewadi Phase 2, Pune, Maharashtra',
      },
    });
    console.log(`   created project ${project.projectId} (${project.projectName})`);
  } else {
    console.log(`   reusing project ${project.projectId} (${project.projectName})`);
  }

  // ── 3. Create the order THROUGH THE CLIENT API (the real path) ─────────────
  step('Logging in as the client over HTTP (number + OTP)');

  const otpRes = await api('POST', '/client/auth/send-otp', {
    body: { phone: CLIENT_PHONE },
  });
  if (otpRes.status !== 200) {
    throw new Error(
      `Client send-otp failed (${otpRes.status}): ${JSON.stringify(otpRes.json)}`,
    );
  }

  const clientLogin = await api('POST', '/client/auth/verify-otp', {
    body: { phone: CLIENT_PHONE, otp: CLIENT_OTP },
  });

  if (clientLogin.status !== 200 || !clientLogin.json?.data?.token) {
    throw new Error(
      `Client login failed (${clientLogin.status}): ${JSON.stringify(clientLogin.json)}`,
    );
  }
  const clientToken = clientLogin.json.data.token;
  console.log(`   client logged in, token issued`);

  step('Creating the order via POST /client/orders (the customer app endpoint)');

  const createRes = await api('POST', '/client/orders', {
    token: clientToken,
    body: {
      projectId: project.projectId,
      productName: 'RMC',
      productGrade: 'M30',
      quantity: '45',
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      time: '09:30',
      deliveryAddress: 'Hinjewadi Phase 2, Gate 3, Pune',
    },
  });

  if (createRes.status !== 201) {
    throw new Error(
      `Order creation failed (${createRes.status}): ${JSON.stringify(createRes.json)}`,
    );
  }

  const orderCode = createRes.json.data.orderId;
  const orderDbId = createRes.json.data.id;
  console.log(`   ✅ order created by the client: ${orderCode}`);

  // Give it a realistic in-flight state so the FT app has something to act on.
  await db.order.update({
    where: { id: orderDbId },
    data: { status: 'IN_PROGRESS', deliveryStatus: 'IN_TRANSIT' },
  });

  // ── 4. Demo TECHNICIAN + assignment ────────────────────────────────────────
  step('Ensuring demo field technician exists (with a known password)');

  let tech = await db.user.findFirst({
    where: { userName: TECH_USERNAME, isDeleted: false },
  });

  if (!tech) {
    tech = await db.user.create({
      data: {
        name: 'Demo Technician',
        employeeId: `EMP-DEMO-${STAMP}`,
        userName: TECH_USERNAME,
        password: hashPassword(TECH_PASSWORD),
        role: 'FIELD_TECHNICIAN',
        phone: '9000000222',
        status: true,
        menuAccess: {},
      },
    });
    console.log(`   created technician ${tech.userName} (${tech.name})`);
  } else {
    await db.user.update({
      where: { id: tech.id },
      data: { password: hashPassword(TECH_PASSWORD), status: true },
    });
    console.log(`   reusing technician ${tech.userName} (${tech.name})`);
  }

  step(`Assigning ${orderCode} to ${tech.userName}`);

  const existing = await db.orderTechnician.findFirst({
    where: { orderId: orderDbId, userId: tech.id },
  });
  if (!existing) {
    await db.orderTechnician.create({
      data: { orderId: orderDbId, userId: tech.id },
    });
  }
  console.log(`   assigned`);

  // ── 5. Prove the technician can actually see it ────────────────────────────
  step('Verifying the technician sees the order through the FT API');

  const techLogin = await api('POST', '/tech/auth/login', {
    body: { userName: TECH_USERNAME, password: TECH_PASSWORD },
  });

  if (techLogin.status !== 200 || !techLogin.json?.data?.token) {
    throw new Error(
      `Tech login failed (${techLogin.status}): ${JSON.stringify(techLogin.json)}`,
    );
  }
  const techToken = techLogin.json.data.token;

  const list = await api('GET', '/tech/orders?type=active', { token: techToken });
  const found = (list.json?.data || []).find((o) => o.orderId === orderCode);

  console.log(`   tech order list -> ${list.status}, ${list.json?.data?.length ?? 0} order(s)`);
  console.log(`   target order visible to technician: ${found ? 'YES ✅' : 'NO ❌'}`);
  if (found) {
    console.log(`   vendors[] present: ${Array.isArray(found.vendors) ? 'YES' : 'NO'}`);
  }

  const cubes = await api('GET', `/tech/orders/${orderCode}/cube-test`, { token: techToken });
  console.log(`   cube-test list -> ${cubes.status} (${cubes.json?.data?.length ?? 0} existing)`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const allTechOrders = await api('GET', '/tech/orders?type=active', { token: techToken });

  console.log(`\n${'═'.repeat(62)}`);
  console.log('  DEMO DATA READY');
  console.log('═'.repeat(62));
  console.log('  FIELD TECHNICIAN APP LOGIN');
  console.log(`    username : ${TECH_USERNAME}`);
  console.log(`    password : ${TECH_PASSWORD}`);
  console.log('');
  console.log('  CLIENT APP LOGIN (number + OTP)');
  console.log(`    number   : ${CLIENT_PHONE}`);
  console.log(`    otp      : ${CLIENT_OTP}`);
  console.log('');
  console.log(`  Order created by client : ${orderCode}`);
  console.log(`  Project                 : ${project.projectName}`);
  console.log(`  Assigned technician     : ${tech.name} (${tech.userName})`);
  console.log(`  Active orders for tech  : ${allTechOrders.json?.data?.length ?? 0}`);
  console.log('═'.repeat(62));
} catch (err) {
  console.error('\n❌ Seed failed:', err.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
