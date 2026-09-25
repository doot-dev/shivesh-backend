import { decrypt } from '../../../helper/security.js';
import jsonwebtoken from 'jsonwebtoken';
import { loadClientAccess } from '../../../helper/clientAccess.js';
const { verify } = jsonwebtoken;

function makeVerifier(requiredType) {
  return async function (req, res, next) {
    try {
      // The Authorization header MUST win over the body.
      //
      // `PUT /fcm-token` posts `{ token: <firebase-token> }`, so reading the
      // body first made this middleware validate the *Firebase* token as the
      // JWT and reject every call with 401 — the auth token was never even
      // looked at. Body/query are kept only as a legacy fallback.
      const token =
        req.headers['authorization']?.replace('Bearer ', '') ||
        req.body?.token ||
        req.query?.token;

      if (!token) {
        return res.status(403).json({ success: false, message: 'Token is required' });
      }

      const decrypted = decrypt(token);

      verify(decrypted, process.env.JWT_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
        if (decoded?.data?.type !== requiredType) {
          return res.status(403).json({ success: false, message: 'Access denied' });
        }
        req.user = decoded;
        if (requiredType !== 'CLIENT') return next();

        // Tokens last 30 days, so re-check on every request: a contact the office
        // (or their owner) deactivates, a changed role, or a client that is no
        // longer active or verified takes effect immediately (docs/06).
        loadClientAccess(decoded.data)
          .then((access) => {
            if (!access) {
              return res.status(401).json({ success: false, message: 'Your access has been removed or is not active' });
            }
            req.clientAccess = access;
            // Comments and audit rows name the person, not the company.
            if (access.contact) req.user.data.contactName = access.contact.name;
            return next();
          })
          .catch(next);
      });
    } catch (error) {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }
  };
}

export const verifyClientToken = makeVerifier('CLIENT');
export const verifyTechToken = makeVerifier('FIELD_TECH');
