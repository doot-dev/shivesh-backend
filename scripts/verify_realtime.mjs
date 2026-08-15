/**
 * End-to-end check of the client mobile flow against a RUNNING server:
 * OTP login -> REST reads -> WebSocket subscribe -> live comment fanout.
 *
 * Run with the dev server up:  node scripts/verify_realtime.mjs
 * Exits non-zero if any step fails, so it can gate a change.
 */
import { WebSocket } from 'ws';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3001';
const WS = BASE.replace('http', 'ws') + '/ws';
const NUMBER = process.env.TEST_NUMBER || '9900223344';

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failures++;
};

const api = async (path, opts = {}) => {
  const res = await fetch(`${BASE}/api/v1/mobile/client${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  return { status: res.status, body };
};

// ── auth ────────────────────────────────────────────────────────────────
const sent = await api('/auth/send-otp', {
  method: 'POST',
  body: JSON.stringify({ number: NUMBER }),
});
check('send-otp accepts a known number', sent.status === 200);

const wrong = await api('/auth/verify-otp', {
  method: 'POST',
  body: JSON.stringify({ number: NUMBER, otp: '9999' }),
});
check('verify-otp REJECTS a wrong OTP', wrong.status === 401, `got ${wrong.status}`);

const login = await api('/auth/verify-otp', {
  method: 'POST',
  body: JSON.stringify({ number: NUMBER, otp: '1111' }),
});
const token = login.body?.data?.token;
check('verify-otp accepts 1111 and issues a token', !!token);
if (!token) process.exit(1);

const auth = { Authorization: `Bearer ${token}` };

// ── an INVALID token must 401: this is what drives the app to /login ────
const bad = await api('/projects', { headers: { Authorization: 'Bearer garbage' } });
check('invalid token is rejected with 401', bad.status === 401, `got ${bad.status}`);

// ── reads ───────────────────────────────────────────────────────────────
const projects = await api('/projects', { headers: auth });
check('projects load', projects.status === 200 && Array.isArray(projects.body?.data));

const orders = await api('/orders?type=active', { headers: auth });
const order = orders.body?.data?.[0];
check('active orders load', orders.status === 200 && !!order, order?.orderId);
if (!order) process.exit(failures ? 1 : 0);

// fcm-token used to 401 because the middleware read the Firebase token from
// the body before the Authorization header. Guard against that regressing.
const fcm = await api('/fcm-token', {
  method: 'PUT',
  headers: auth,
  body: JSON.stringify({ token: 'firebase-token-under-test', platform: 'android' }),
});
check('fcm-token accepts the auth header (not the body token)', fcm.status === 200,
  `got ${fcm.status}`);

// ── realtime ────────────────────────────────────────────────────────────
const detail = await api(`/orders/${order.orderId}`, { headers: auth });
const dbId = detail.body?.data?.id;

const received = [];
const ws = new WebSocket(`${WS}?token=${encodeURIComponent(token)}`);

const done = new Promise((resolve) => {
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'subscribe', orderId: dbId }));
    setTimeout(async () => {
      await api(`/orders/${order.orderId}/comments`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ message: 'realtime verification ping' }),
      });
    }, 600);
  });
  ws.on('message', (raw) => {
    try {
      received.push(JSON.parse(raw.toString()));
    } catch {
      /* ignore malformed frame */
    }
  });
  ws.on('error', () => resolve());
  setTimeout(resolve, 5000);
});

await done;
ws.close();

check('websocket connected', received.length > 0);
const gotComment = received.some(
  (m) => JSON.stringify(m).includes('realtime verification ping'),
);
check('comment arrives over the socket without a refresh', gotComment);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
