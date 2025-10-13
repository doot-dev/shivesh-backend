import { Router } from 'express'
import * as vendorController from "../controllers/vendorController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const vendorRoute = Router();


//handler routes 
vendorRoute
  .post('/handlers', verifyToken, vendorController.addHandler)
  .put('/handlers', verifyToken, vendorController.updateHandler)
  .get('/handlers/:locationId', verifyToken, vendorController.getAllHandlers)
  .delete('/handlers/:id', verifyToken, vendorController.deleteHandler);


// Location routes 
vendorRoute
  .post('/locations', verifyToken, vendorController.addLocation)
  .get('/locations/:id', verifyToken, vendorController.getLocation)
  .put('/locations/:id', verifyToken, vendorController.updateLocation)
  .delete('/locations/:id', verifyToken, vendorController.deleteLocation);

// Vendor routes
vendorRoute
  .post('/', verifyToken, vendorController.createVendor)
  .get('/', verifyToken, vendorController.getAllVendors)
  .put('/', verifyToken, vendorController.updateVendor);

// Get all locations for a vendor - after vendor CRUD but before /:id
vendorRoute.get('/:vendorId/locations', verifyToken, vendorController.getAllLocations);

// Vendor get/delete by ID - MUST be last
vendorRoute
  .get('/:id', verifyToken, vendorController.getVendor)
  .delete('/:id', verifyToken, vendorController.deleteVendor);

export default vendorRoute;