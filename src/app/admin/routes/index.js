import { Router } from "express"
import userRoute from "./userRoute.js"
import tokenRoute from "./tokenRoute.js"
import authRoute from "./authRoute.js"
import productRoute from "./productRoute.js"
import vendorRoute from "./vendorRoute.js"
import leadRoute from "./leadsRoute.js"
import clientRoute from "./clientRoute.js"


const router = Router()
router.use('/auth', authRoute)
router.use('/token', tokenRoute)
router.use('/user', userRoute)
router.use('/product', productRoute)
router.use('/vendor', vendorRoute)
router.use('/leads', leadRoute)
router.use('/client', clientRoute)

export default router 