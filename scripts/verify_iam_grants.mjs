// Self-check for the IAM grant guard: a non-super-admin can only hand out
// permissions they already hold. Pure logic — touches no database.
//
//   node scripts/verify_iam_grants.mjs
import assert from 'node:assert/strict';
import { ungrantable } from '../src/helper/accessControl.js';

const limited = { isSuperAdmin: false, permissions: ['users.view', 'users.update'] };
const superAdmin = { isSuperAdmin: true, permissions: [] };

assert.deepEqual(ungrantable(limited, ['users.view']), []);
assert.deepEqual(ungrantable(limited, ['users.view', 'roles.update']), ['roles.update']);
assert.deepEqual(ungrantable(superAdmin, ['roles.update', 'billing.approve']), []);
assert.deepEqual(ungrantable(null, ['orders.view']), ['orders.view']);

console.log('IAM grant guard OK');
process.exit(0);
