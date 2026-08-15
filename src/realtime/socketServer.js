/**
 * WebSocket hub for live order updates.
 *
 * Clients (mobile app, admin panel) connect to `/ws` with the SAME encrypted JWT
 * they use for REST, then subscribe to per-order rooms. Controllers push events
 * through `emitOrderEvent` / `emitToClient` so a comment or a status change
 * lands on every open device instantly instead of waiting for a poll.
 *
 * Wire protocol (JSON both ways):
 *   client -> server: { type: 'subscribe',   orderId: 'ORD-2025-0001' }
 *                     { type: 'unsubscribe', orderId: 'ORD-2025-0001' }
 *                     { type: 'ping' }
 *   server -> client: { type: 'connected',      data: { ... } }
 *                     { type: 'comment:new',    orderId, data: <comment> }
 *                     { type: 'order:status',   orderId, data: { status, deliveryStatus } }
 *                     { type: 'order:new',      orderId, data: <order> }
 *                     { type: 'notification',   data: <notification> }
 *                     { type: 'pong' }
 */
import { WebSocketServer } from 'ws';
import jsonwebtoken from 'jsonwebtoken';
import db from '../config/database.js';
import { decrypt } from '../helper/security.js';
import logger from '../helper/logger.js';

const { verify } = jsonwebtoken;

/** @type {WebSocketServer | null} */
let wss = null;

/**
 * Every live socket, keyed by nothing — we scan and filter. Connection counts
 * here are in the hundreds, not millions, so a Set scan is cheaper and far
 * less bug-prone than maintaining half a dozen reverse indexes.
 * @type {Set<import('ws').WebSocket>}
 */
const sockets = new Set();

const HEARTBEAT_MS = 30_000;

/**
 * Decode the encrypted JWT used by REST. Returns the token's `data` payload
 * ({ type, id, clientId, name, phone }) or null when the token is unusable.
 */
function authenticate(rawToken) {
  if (!rawToken) return null;
  try {
    const decrypted = decrypt(String(rawToken).replace('Bearer ', ''));
    if (!decrypted) return null;
    const decoded = verify(decrypted, process.env.JWT_TOKEN);
    return decoded?.data ?? null;
  } catch {
    return null;
  }
}

/** Pull the token off the query string or the Authorization header. */
function extractToken(req) {
  try {
    const url = new URL(req.url, 'http://localhost');
    return (
      url.searchParams.get('token') ||
      req.headers['authorization'] ||
      req.headers['sec-websocket-protocol'] ||
      null
    );
  } catch {
    return req.headers['authorization'] ?? null;
  }
}

function send(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch (err) {
    logger.error('WS send error:', err.message);
  }
}

/**
 * May this socket listen to that order? A room subscription streams the order's
 * comments and status, so it is an authorization boundary, not a routing hint:
 * a CLIENT may only ever join their OWN orders and a FIELD_TECH only orders
 * they are assigned to. Never relax this to "any authenticated user".
 */
async function canAccessOrder(user, orderId) {
  if (user.type === 'ADMIN') return true;

  // Dev bypass accounts have no real rows — let them subscribe to nothing.
  if (String(user.id).startsWith('dev-')) return false;

  if (user.type === 'CLIENT') {
    const order = await db.order.findFirst({
      where: { orderId, clientId: String(user.id), isDeleted: false },
      select: { id: true },
    });
    return Boolean(order);
  }

  if (user.type === 'FIELD_TECH') {
    const order = await db.order.findFirst({
      where: {
        orderId,
        isDeleted: false,
        technicians: { some: { userId: Number(user.id), isDeleted: false } },
      },
      select: { id: true },
    });
    return Boolean(order);
  }

  return false;
}

async function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return send(ws, { type: 'error', message: 'Invalid JSON' });
  }

  switch (msg.type) {
    case 'subscribe': {
      if (!msg.orderId) break;
      const orderId = String(msg.orderId);
      let allowed = false;
      try {
        allowed = await canAccessOrder(ws.user, orderId);
      } catch (err) {
        logger.error('WS subscribe check failed:', err.message);
      }
      if (!allowed) {
        send(ws, { type: 'error', message: 'Not allowed to subscribe to this order', orderId });
        break;
      }
      ws.rooms.add(orderId);
      send(ws, { type: 'subscribed', orderId });
      break;
    }

    case 'unsubscribe':
      if (msg.orderId) {
        ws.rooms.delete(String(msg.orderId));
        send(ws, { type: 'unsubscribed', orderId: msg.orderId });
      }
      break;

    case 'ping':
      send(ws, { type: 'pong' });
      break;

    default:
      send(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
  }
}

/**
 * Attach the WebSocket server to the running HTTP server. Call once from
 * server.js AFTER app.listen — ws upgrades the same port, so no extra port
 * or firewall rule is needed.
 */
export function initSocketServer(httpServer) {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const user = authenticate(extractToken(req));

    // An unauthenticated socket is closed immediately: order rooms carry
    // client-identifying data, so anonymous listeners are never allowed.
    if (!user) {
      send(ws, { type: 'error', message: 'Unauthorized' });
      return ws.close(4401, 'Unauthorized');
    }

    ws.user = user;
    ws.rooms = new Set();
    ws.isAlive = true;
    sockets.add(ws);

    logger.info(`WS connected: ${user.type} ${user.id} (${sockets.size} live)`);

    send(ws, {
      type: 'connected',
      data: { type: user.type, id: user.id, name: user.name },
    });

    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => {
      handleMessage(ws, raw).catch((err) =>
        logger.error('WS message handler error:', err.message),
      );
    });
    ws.on('error', (err) => logger.error('WS socket error:', err.message));
    ws.on('close', () => {
      sockets.delete(ws);
      logger.info(`WS disconnected: ${user.type} ${user.id} (${sockets.size} live)`);
    });
  });

  // Drop half-open sockets (phone lost signal / app killed) so we do not leak
  // them — a dead TCP socket can otherwise sit in `sockets` forever.
  const heartbeat = setInterval(() => {
    for (const ws of sockets) {
      if (ws.isAlive === false) {
        sockets.delete(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try {
        ws.ping();
      } catch {
        sockets.delete(ws);
      }
    }
  }, HEARTBEAT_MS);

  wss.on('close', () => clearInterval(heartbeat));

  logger.info('🔌 WebSocket server listening on /ws');
  return wss;
}

// ─── Emitters used by controllers ─────────────────────────────────────────────

/**
 * Broadcast an order event to everyone subscribed to that order room, plus the
 * owning client even if they never subscribed (so a list screen updates too).
 *
 * @param {string} orderId      public order id, e.g. ORD-2025-0001
 * @param {string} type         event name, e.g. 'comment:new'
 * @param {object} data         event payload
 * @param {{ clientDbId?: string, techUserIds?: Array<number|string> }} [targets]
 */
export function emitOrderEvent(orderId, type, data, targets = {}) {
  if (!wss) return;

  const { clientDbId, techUserIds = [] } = targets;
  const techIds = techUserIds.map(String);
  const payload = { type, orderId, data, at: new Date().toISOString() };

  for (const ws of sockets) {
    const u = ws.user;
    if (!u) continue;

    const inRoom = ws.rooms?.has(String(orderId));
    const isOwningClient =
      u.type === 'CLIENT' && clientDbId && String(u.id) === String(clientDbId);
    const isAssignedTech =
      u.type === 'FIELD_TECH' && techIds.includes(String(u.id));
    const isAdmin = u.type === 'ADMIN';

    if (inRoom || isOwningClient || isAssignedTech || isAdmin) {
      send(ws, payload);
    }
  }
}

/** Push a payload to every live socket belonging to one client. */
export function emitToClient(clientDbId, type, data) {
  if (!wss || !clientDbId) return;
  const payload = { type, data, at: new Date().toISOString() };

  for (const ws of sockets) {
    if (ws.user?.type === 'CLIENT' && String(ws.user.id) === String(clientDbId)) {
      send(ws, payload);
    }
  }
}

/** Live socket count — used by /health. */
export function getSocketCount() {
  return sockets.size;
}
