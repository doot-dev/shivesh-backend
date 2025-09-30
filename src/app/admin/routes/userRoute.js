import { Router } from 'express'
import * as userController from "../controllers/userController.js"
import { verifyToken } from '../../../config/jwtConfig.js';



const userData = Router();

userData
  .post('/', verifyToken, userController.createUser)
  .get('/all', verifyToken, userController.getAllUsers)
  .get('/', verifyToken, userController.getUser)
  .put('/', verifyToken, userController.updateUser)
  .delete('/', verifyToken, userController.deleteUser)
  .delete("/hard", verifyToken, userController.deleteUserFromTable)


export default userData;