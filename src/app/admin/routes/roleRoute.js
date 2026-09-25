import { Router } from 'express';
import * as roleController from '../controllers/roleController.js';
import * as clientAccess from '../controllers/clientAccessController.js';
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const router = Router();

// The catalog is readable by anyone who can open the Roles screen at all —
// it is a static list of module names, not sensitive data.
router.get('/catalog', verifyToken, requirePermission(can('roles', 'view')), roleController.getPermissionCatalog);

router.get('/all', verifyToken, requirePermission(can('roles', 'view')), roleController.getAllRoles);
router.get('/', verifyToken, requirePermission(can('roles', 'view')), roleController.getRole);
router.post('/', verifyToken, requirePermission(can('roles', 'create')), roleController.createRole);
router.put('/', verifyToken, requirePermission(can('roles', 'update')), roleController.updateRole);
router.delete('/', verifyToken, requirePermission(can('roles', 'delete')), roleController.deleteRole);

// Per-user overrides are edited from the Users screen, so they are gated on
// users.update rather than on the roles module.
router.get('/user-permissions', verifyToken, requirePermission(can('users', 'view')), roleController.getUserPermissions);
router.put('/user-permissions', verifyToken, requirePermission(can('users', 'update')), roleController.setUserPermissions);

// docs/06: Client Roles — the client app's roles, a separate catalog (module clientRoles).
router.get('/client/catalog', verifyToken, requirePermission(can('clientRoles', 'view')), clientAccess.getCatalog);
router.get('/client/all', verifyToken, requirePermission(can('clientRoles', 'view'), can('clients', 'view')), clientAccess.listRoles);
router.post('/client', verifyToken, requirePermission(can('clientRoles', 'create')), clientAccess.createRole);
router.put('/client', verifyToken, requirePermission(can('clientRoles', 'update')), clientAccess.updateRole);
router.delete('/client', verifyToken, requirePermission(can('clientRoles', 'delete')), clientAccess.deleteRole);

export default router;
