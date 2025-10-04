import { Router } from 'express'
import * as authController from "../controllers/authController.js"



const authRoute = Router();

authRoute
  .post('/', authController.login)
  .post("/forget-password", authController.forgetPassword);



export default authRoute;