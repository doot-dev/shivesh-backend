// One-off: copy every file under public/uploads into the MinIO bucket, keeping
// the same relative path as the object key, so URLs stored in the DB keep working.
//
//   node scripts/migrate_uploads_to_minio.mjs            # copy, skip what's already there
//   node scripts/migrate_uploads_to_minio.mjs --dry-run  # just count
//
// Local files are NOT deleted — they stay as a backup and as the fallback that
// app.js serves when an object is missing. Safe to re-run.
import path from 'path';
import fs from 'fs/promises';
import { Client } from 'minio';
import { UPLOADS_DIR, keyOf, storageEnabled } from '../src/config/objectStorage.js';

const dryRun = process.argv.includes('--dry-run');
if (!storageEnabled()) {
  console.error('MINIO_ENDPOINT is not set (.env.local) — nothing to do');
  process.exit(1);
}

const c = new Client({
  endPoint: process.env.MINIO_ENDPOINT,
  port: Number(process.env.MINIO_PORT || 9000),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY,
  secretKey: process.env.MINIO_SECRET_KEY,
});
const bucket = process.env.MINIO_BUCKET || 'shivesh-uploads';
if (!(await c.bucketExists(bucket))) await c.makeBucket(bucket);

const TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' };

async function* walk(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile() && !e.name.startsWith('.')) yield p;
  }
}

const count = { found: 0, copied: 0, skipped: 0, failed: 0 };
const byFolder = {};
for await (const file of walk(UPLOADS_DIR)) {
  const key = keyOf(file);
  count.found++;
  const top = key.split('/')[0];
  byFolder[top] = (byFolder[top] || 0) + 1;
  if (dryRun) continue;
  try {
    const exists = await c.statObject(bucket, key).then(() => true, () => false);
    if (exists) { count.skipped++; continue; }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    await c.fPutObject(bucket, key, file, { 'Content-Type': type });
    count.copied++;
  } catch (err) {
    count.failed++;
    console.error(`FAILED ${key}: ${err.message}`);
  }
}

console.log(JSON.stringify({ bucket, dryRun, ...count, byFolder }, null, 2));
process.exit(count.failed ? 1 : 0);
