import { Router } from 'express'
import * as vendorController from "../controllers/vendorController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const vendorRoute = Router();

// Handler routes
vendorRoute.post('/handlers', verifyToken, vendorController.addHandler);
vendorRoute.put('/handlers', verifyToken, vendorController.updateHandler);
vendorRoute.get('/handlers/:locationId', verifyToken, vendorController.getAllHandlers);
vendorRoute.delete('/handlers/:id', verifyToken, vendorController.deleteHandler);

// Location routes
vendorRoute.post('/locations', verifyToken, vendorController.addLocation);
vendorRoute.get('/locations/:id', verifyToken, vendorController.getLocation);
vendorRoute.put('/locations/', verifyToken, vendorController.updateLocation);
vendorRoute.delete('/locations/:id', verifyToken, vendorController.deleteLocation);

// Vendor routes
vendorRoute.post('/', verifyToken, vendorController.createVendor);
vendorRoute.get('/', verifyToken, vendorController.getAllVendors);
vendorRoute.put('/', verifyToken, vendorController.updateVendor);
vendorRoute.get('/:vendorId/locations', verifyToken, vendorController.getAllLocations);
vendorRoute.get('/:id', verifyToken, vendorController.getVendor);
vendorRoute.delete('/:id', verifyToken, vendorController.deleteVendor);

export default vendorRoute;