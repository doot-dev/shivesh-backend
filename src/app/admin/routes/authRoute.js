import { Router } from 'express'
import * as authController from "../controllers/authController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const authRoute = Router();

authRoute.post('/', authController.login);
authRoute.post("/forget-password", authController.forgetPassword);

// Session + live permissions. Deliberately NOT permission-gated: every signed-in
// user must be able to ask "who am I and what can I do", including a user whose
// permissions were just reduced to nothing.
authRoute.get("/me", verifyToken, authController.me);

export default authRoute;
