import jsonwebtoken from 'jsonwebtoken';
import { decrypt } from '../helper/security.js';

/**
 * Private uploads (G9 / P1.9). Every /uploads file needs a valid panel or app
 * token — in the Authorization header, or as ?token= for links opened in a new
 * tab. KYC documents (Aadhaar, PAN) are for panel users only.
 *
 * Switched on with UPLOADS_REQUIRE_AUTH=true once the panel and both apps send
 * the token; until then files stay public so installed apps keep working.
 */
export function requireUploadAuth(req, res, next) {
  if (process.env.UPLOADS_REQUIRE_AUTH !== 'true') return next();

  const raw = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!raw) return res.status(401).json({ success: false, message: 'Sign in to view this file' });

  let decoded;
  try {
    decoded = jsonwebtoken.verify(decrypt(raw), process.env.JWT_TOKEN);
  } catch {
    return res.status(401).json({ success: false, message: 'Sign in to view this file' });
  }

  // Panel tokens carry no `type`; app tokens are CLIENT or FIELD_TECH.
  if (req.path.startsWith('/kyc/') && decoded?.data?.type) {
    return res.status(403).json({ success: false, message: 'Not allowed' });
  }
  next();
}
