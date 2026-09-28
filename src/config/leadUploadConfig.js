import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pushUploads, UPLOADS_DIR } from './objectStorage.js';

// Lead chat attachments (2026-09-28): site photos and voice notes, one folder
// per lead under public/uploads/leads (panel users only, see uploadAuth.js).
const baseDir = path.join(UPLOADS_DIR, 'leads');
const safe = (id) => String(id).replace(/[^a-zA-Z0-9]/g, '');

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(baseDir, safe(req.params.leadId));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

// Browsers record audio as webm/ogg (Chrome, Firefox) or mp4/m4a (Safari).
const ALLOWED = /^(image\/(jpeg|png|webp|heic)|audio\/(webm|ogg|mp4|mpeg|aac|wav|x-m4a))/;

export const uploadLeadFile = [
  multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 },
    fileFilter: (req, file, cb) => (ALLOWED.test(file.mimetype)
      ? cb(null, true)
      : cb(new Error('Only photos (jpg, png, webp, heic) and voice notes are allowed'))),
  }).single('file'),
  pushUploads,
];

export const leadFileUrl = (leadId, filename) => `/uploads/leads/${safe(leadId)}/${filename}`;
