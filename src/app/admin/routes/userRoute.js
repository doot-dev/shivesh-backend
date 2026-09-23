import { Router } from 'express'
import * as userController from "../controllers/userController.js"
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, requireSuperAdmin, can } from '../../../helper/accessControl.js';

const userData = Router();

userData.post('/', verifyToken, requirePermission(can('users', 'create')), userController.createUser);
// Orders need the technician list to assign field staff, so users.view is not
// the only way in here — otherwise an order manager could not pick a tech.
userData.get('/all', verifyToken, requirePermission(can('users', 'view'), can('orders', 'view')), userController.getAllUsers);
userData.get('/', verifyToken, requirePermission(can('users', 'view')), userController.getUser);
userData.put('/', verifyToken, requirePermission(can('users', 'update')), userController.updateUser);
userData.delete('/', verifyToken, requirePermission(can('users', 'delete')), userController.deleteUser);

// Hard delete permanently destroys the row and its history. Reserved for a
// super admin no matter what the users.delete permission says.
userData.delete("/hard", verifyToken, requireSuperAdmin, userController.deleteUserFromTable);

userData.put("/reset-password", verifyToken, requirePermission(can('users', 'update')), userController.resetPassword);

export default userData;
