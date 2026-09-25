// Self-check for the Phase 0 rules that are pure logic (no DB):
//   node scripts/verify_phase0.mjs
import assert from 'node:assert/strict';
import { billStatusChangeBlocked } from '../src/app/admin/controllers/billController.js';
import { keyOf } from '../src/config/objectStorage.js';

const admin = { isSuperAdmin: false };
const superAdmin = { isSuperAdmin: true };

// P0.7 bill status rules
assert.equal(billStatusChangeBlocked('PENDING', 'SENT', admin), null);
assert.equal(billStatusChangeBlocked('SENT', 'PAID', admin), null);
assert.match(billStatusChangeBlocked('CANCELLED', 'PENDING', superAdmin), /final/);
assert.match(billStatusChangeBlocked('PAID', 'SENT', superAdmin), /cannot move back/);
assert.match(billStatusChangeBlocked('SENT', 'CANCELLED', admin), /Super Admin/);
assert.equal(billStatusChangeBlocked('SENT', 'CANCELLED', superAdmin), null);
assert.equal(billStatusChangeBlocked('PAID', 'PAID', admin), null);

// MinIO keys: URL -> key, and nothing outside /uploads
assert.equal(keyOf('/uploads/kyc/CL-1/a.png'), 'kyc/CL-1/a.png');
assert.equal(keyOf('/uploads/../src/app.js'), null);
assert.equal(keyOf('/etc/passwd'), null);

console.log('verify_phase0: all checks passed');
process.exit(0);
