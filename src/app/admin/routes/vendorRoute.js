import { Router } from 'express'
import * as vendorController from "../controllers/vendorController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const vendorRoute = Router();

vendorRoute
  .post('/', verifyToken, vendorController.createVendor)
  .get('/', verifyToken, vendorController.getAllVendors)
  .get('/:id', verifyToken, vendorController.getVendor);

export default vendorRoute;