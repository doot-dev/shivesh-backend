import { Router } from 'express'
import * as userController from "../controllers/userController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const userData = Router();

userData.post('/', verifyToken, userController.createUser);
userData.get('/all', verifyToken, userController.getAllUsers);
userData.get('/', verifyToken, userController.getUser);
userData.put('/', verifyToken, userController.updateUser);
userData.delete('/', verifyToken, userController.deleteUser);
userData.delete("/hard", verifyToken, userController.deleteUserFromTable);
userData.put("/reset-password", verifyToken, userController.resetPassword);

export default userData;