/**
 * Verifies the ADMIN PANEL's realtime path end-to-end against a running server.
 *
 * Why this exists: the admin panel originally shipped a socket.io client, which
 * can never talk to this backend's raw `ws` hub. This script drives the exact
 * wire protocol the rewritten src/services/socket.js uses, so a regression back
 * to socket.io (or an event rename on either side) fails here instead of
 * silently showing an admin stale comments.
 *
 * Run with the server up:  node scripts/verify_admin_socket.mjs
 */
import 'dotenv/config';
import WebSocket from 'ws';
import { PrismaClient } from '@prisma/client';
import { generateToken } from '../src/config/jwtConfig.js';

const BASE = process.env.VERIFY_BASE_URL || 'http://localhost:3001';
const WS_BASE = BASE.replace(/^http/i, 'ws');
const db = new PrismaClient();

let failures = 0;
const check = (ok, label, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures += 1;
};

/** Wait for a socket message matching `predicate`, or resolve null on timeout. */
function waitFor(ws, predicate, ms = 8000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve(null);
    }, ms);
    function onMessage(raw) {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (predicate(msg)) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(msg);
      }
    }
    ws.on('message', onMessage);
  });
}

async function main() {
  // ── Fixtures: a real admin and a real order ────────────────────────────────
  const admin = await db.user.findFirst({
    where: { role: 'ADMIN', isDeleted: false },
    select: { id: true, userName: true, name: true },
  });
  if (!admin) throw new Error('No ADMIN user in the database to test with.');

  const order = await db.order.findFirst({
    where: { isDeleted: false },
    select: { id: true, orderId: true, clientId: true },
  });
  if (!order) throw new Error('No order in the database to test with.');

  // Mint through the app's own helper so this exercises the real auth path
  // rather than a hand-rolled token that could diverge from production.
  const token = generateToken({
    type: 'ADMIN',
    id: admin.id,
    name: admin.name,
  });

  // ── 1. The admin panel's exact handshake: /ws?token=... ────────────────────
  const url = `${WS_BASE}/ws?token=${encodeURIComponent(token)}`;
  const ws = new WebSocket(url);

  const connected = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'connected') {
        clearTimeout(timer);
        resolve(msg);
      }
    });
    ws.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  check(Boolean(connected), 'admin connects over raw ws (query-string token)');
  if (!connected) {
    ws.close();
    return;
  }

  // ── 2. Room subscribe using the real message shape ─────────────────────────
  ws.send(JSON.stringify({ type: 'subscribe', orderId: order.orderId }));
  const subscribed = await waitFor(ws, (m) => m.type === 'subscribed');
  check(Boolean(subscribed), 'admin subscribes to an order room', order.orderId);

  // ── 3. A client comment must reach the admin socket ────────────────────────
  const commentPromise = waitFor(
    ws,
    (m) => m.type === 'comment:new' && m.orderId === order.orderId,
  );

  // Post over HTTP, never by importing the emitter: this script is a separate
  // process, so an in-process emit would touch a DIFFERENT module instance with
  // no sockets attached and pass while proving nothing.
  const marker = `admin-socket-verify-${Date.now()}`;
  const res = await fetch(
    `${BASE}/api/v1/admin/orders/${order.orderId}/comments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: token },
      body: JSON.stringify({ message: marker }),
    },
  );
  check(res.ok, 'admin posts a comment over HTTP', `status ${res.status}`);

  const received = await commentPromise;
  check(
    Boolean(received),
    'comment:new reaches the admin socket with no refresh',
    received ? `“${received.data?.message ?? ''}”` : 'timed out',
  );

  // ── 4. Unsubscribe uses the shape the panel sends ──────────────────────────
  ws.send(JSON.stringify({ type: 'unsubscribe', orderId: order.orderId }));
  const unsubscribed = await waitFor(ws, (m) => m.type === 'unsubscribed');
  check(Boolean(unsubscribed), 'admin leaves the order room');

  ws.close();

  // ── 5. A bad token must be refused ─────────────────────────────────────────
  const badWs = new WebSocket(`${WS_BASE}/ws?token=not-a-real-token`);
  const closeCode = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 8000);
    badWs.on('close', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    badWs.on('error', () => {});
  });
  check(closeCode === 4401, 'invalid token is refused with 4401', `got ${closeCode}`);
}

main()
  .catch((err) => {
    console.error('FATAL', err);
    failures += 1;
  })
  .finally(async () => {
    await db.$disconnect();
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  });
