import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Client } from 'minio';
import logger from '../helper/logger.js';

/**
 * MinIO-backed storage for everything under /uploads (KYC, challans, bill
 * documents, cube-test reports).
 *
 * THE KEY IS THE PUBLIC PATH. A file served at `/uploads/challans/ORD-1/a.jpg`
 * is stored under the key `challans/ORD-1/a.jpg`. Every URL already saved in the
 * DB therefore keeps working unchanged — only where the bytes live moved.
 *
 * Multer still writes to disk first (the configs are untouched); `pushUploads`
 * then copies each file into the bucket and removes the temp copy.
 *
 * With no MINIO_ENDPOINT set, everything here is a no-op and files stay on disk,
 * so a machine without MinIO keeps behaving exactly as before.
 *
 * Credentials live in the git-ignored `.env.local`, NOT in `.env` (which is
 * tracked in git).
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

export const UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads');
const BUCKET = process.env.MINIO_BUCKET || 'shivesh-uploads';

let client = null;
function minio() {
  if (!process.env.MINIO_ENDPOINT) return null;
  if (!client) {
    client = new Client({
      endPoint: process.env.MINIO_ENDPOINT,
      port: Number(process.env.MINIO_PORT || 9000),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
  }
  return client;
}

export const storageEnabled = () => Boolean(minio());

/** `/uploads/a/b.jpg` or a disk path under public/uploads -> `a/b.jpg`; null if outside uploads. */
export function keyOf(urlOrPath) {
  if (typeof urlOrPath !== 'string') return null;
  const abs = urlOrPath.startsWith('/uploads/')
    ? path.resolve(UPLOADS_DIR, '.' + urlOrPath.slice('/uploads'.length))
    : path.resolve(urlOrPath);
  if (!abs.startsWith(UPLOADS_DIR + path.sep)) return null;
  return path.relative(UPLOADS_DIR, abs).split(path.sep).join('/');
}

export async function ensureBucket() {
  const c = minio();
  if (!c) return logger.info('MinIO not configured — uploads stay on local disk');
  if (!(await c.bucketExists(BUCKET))) await c.makeBucket(BUCKET);
  logger.info(`MinIO ready: bucket "${BUCKET}" at ${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT}`);
}

/** Express middleware: run after multer. Moves req.file / req.files into MinIO. */
export async function pushUploads(req, res, next) {
  const c = minio();
  if (!c) return next();
  const files = req.file
    ? [req.file]
    : Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat();
  try {
    for (const f of files) {
      const key = keyOf(f.path);
      if (!key) continue;
      await c.fPutObject(BUCKET, key, f.path, { 'Content-Type': f.mimetype });
      await fs.unlink(f.path).catch(() => {});
    }
    next();
  } catch (err) {
    logger.error('MinIO upload failed:', err);
    next(err);
  }
}

/** Delete one stored file by URL, key or disk path. Never throws. */
export async function removeUpload(urlOrPath) {
  const c = minio();
  const key = keyOf(urlOrPath) ?? urlOrPath;
  if (!c || !key) return;
  await c.removeObject(BUCKET, key).catch((err) => logger.warn(`MinIO delete ${key}: ${err.message}`));
}

/** Read a stored file into a Buffer (MinIO first, then legacy disk). */
export async function readUpload(urlOrPath) {
  const key = keyOf(urlOrPath);
  if (!key) throw new Error('Not an upload path');
  const c = minio();
  if (c) {
    try {
      const stream = await c.getObject(BUCKET, key);
      const chunks = [];
      for await (const chunk of stream) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.code !== 'NoSuchKey' && err.code !== 'NotFound') throw err;
    }
  }
  return fs.readFile(path.join(UPLOADS_DIR, key));
}

/** Express handler for GET /uploads/*. Falls through to the disk static handler on a miss. */
export async function serveUploads(req, res, next) {
  const c = minio();
  if (!c || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
  let key;
  try {
    key = keyOf('/uploads' + decodeURIComponent(req.path));
  } catch {
    return next();
  }
  if (!key) return next();
  try {
    const stat = await c.statObject(BUCKET, key);
    res.setHeader('Content-Type', stat.metaData?.['content-type'] || 'application/octet-stream');
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    if (req.method === 'HEAD') return res.end();
    (await c.getObject(BUCKET, key)).on('error', next).pipe(res);
  } catch (err) {
    if (err.code === 'NotFound' || err.code === 'NoSuchKey') return next();
    next(err);
  }
}
