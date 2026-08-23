import bcrypt from 'bcryptjs';
import { encrypt, decrypt } from './security.js';

/**
 * Password hashing/verification shared by every login entry point
 * (admin panel, field-technician app, client app).
 *
 * WHY TWO FORMATS: `User.password` rows created by the admin panel store an
 * AES-*reversible* ciphertext (helper/security.js `encrypt`), because
 * userController.createUser and admin authController.login were built that way.
 * Those rows still have to log in, so they cannot simply be rejected. Anything
 * NEW — client credentials, password changes — is written as a bcrypt hash,
 * which is one-way and the format we actually want everywhere.
 *
 * Net effect: verifyPassword accepts either, hashPassword only ever produces
 * bcrypt. Legacy rows therefore upgrade themselves the first time the password
 * is changed, with no migration and no flag day.
 */

const BCRYPT_ROUNDS = 10;

/** bcrypt hashes are self-describing: $2a$ / $2b$ / $2y$ + cost + salt. */
function isBcryptHash(stored) {
  return typeof stored === 'string' && /^\$2[aby]\$\d{2}\$/.test(stored);
}

/** Hash a plaintext password for storage. Always bcrypt — never the AES form. */
export function hashPassword(plain) {
  return bcrypt.hashSync(String(plain), BCRYPT_ROUNDS);
}

/**
 * Check a plaintext password against whatever is stored, in either format.
 *
 * Returns false (never throws) for a missing/blank stored value, so an account
 * that has no password set yet simply cannot log in by password — it does not
 * crash the route or, worse, pass an empty-string comparison.
 */
export function verifyPassword(plain, stored) {
  if (!plain || !stored) return false;

  if (isBcryptHash(stored)) {
    try {
      return bcrypt.compareSync(String(plain), stored);
    } catch {
      return false;
    }
  }

  // Legacy AES-reversible ciphertext written by the admin panel.
  try {
    const decrypted = decrypt(stored);
    return decrypted.length > 0 && decrypted === String(plain);
  } catch {
    return false;
  }
}

/** Legacy AES encrypt, re-exported so callers don't import security.js directly. */
export { encrypt as legacyEncryptPassword };
