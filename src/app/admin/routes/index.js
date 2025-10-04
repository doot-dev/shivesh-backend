import { Router } from "express"
import userRoute from "./userRoute.js"
import tokenRoute from "./tokenRoute.js"
import authRoute from "./authRoute.js"
import productRoute from "./productRoute.js"



const router = Router()
router.use('/auth', authRoute)
router.use('/token', tokenRoute)
router.use('/user', userRoute)
router.use('/product', productRoute)


export default router 