import { Router } from "express"
import userRoute from "./userRoute.js"
import tokenRoute from "./tokenRoute.js"
import authRoute from "./authRoute.js"
import productRoute from "./productRoute.js"
import vendorRoute from "./vendorRoute.js"
import leadRoute from "./leadsRoute.js"
import clientRoute from "./clientRoute.js"
import projectRoute from "./projectRoute.js"
import orderRoute from "./orderRoute.js"
import dashboardRoute from "./dashboardRoute.js"
import notificationRoute from "./notificationRoute.js"


const router = Router()
router.use('/auth', authRoute)
router.use('/token', tokenRoute)
router.use('/user', userRoute)
router.use('/product', productRoute)
router.use('/vendor', vendorRoute)
router.use('/leads', leadRoute)
router.use('/client', clientRoute)
router.use('/project', projectRoute)
router.use('/orders', orderRoute)
router.use('/dashboard', dashboardRoute)
router.use('/notifications', notificationRoute)

export default router 