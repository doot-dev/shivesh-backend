import { Router } from 'express'
import * as vendorController from "../controllers/vendorController.js"
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const vendorRoute = Router();

// Handler routes — handlers and locations belong to a vendor, so they are
// gated on the vendor module rather than having modules of their own.
vendorRoute.post('/handlers', verifyToken, requirePermission(can('vendorPlants', 'create')), vendorController.addHandler);
vendorRoute.put('/handlers', verifyToken, requirePermission(can('vendorPlants', 'update')), vendorController.updateHandler);
vendorRoute.get('/handlers/:locationId', verifyToken, requirePermission() /* lookup: any signed-in user */, vendorController.getAllHandlers);
vendorRoute.delete('/handlers/:id', verifyToken, requirePermission(can('vendorPlants', 'delete')), vendorController.deleteHandler);

// Location routes
vendorRoute.post('/locations', verifyToken, requirePermission(can('vendorPlants', 'create')), vendorController.addLocation);
vendorRoute.get('/locations/:id', verifyToken, requirePermission() /* lookup: any signed-in user */, vendorController.getLocation);
vendorRoute.put('/locations/', verifyToken, requirePermission(can('vendorPlants', 'update')), vendorController.updateLocation);
vendorRoute.delete('/locations/:id', verifyToken, requirePermission(can('vendorPlants', 'delete')), vendorController.deleteLocation);

// Vendor routes
vendorRoute.post('/', verifyToken, requirePermission(can('vendors', 'create')), vendorController.createVendor);
vendorRoute.get('/', verifyToken, requirePermission() /* lookup: any signed-in user */, vendorController.getAllVendors);
vendorRoute.put('/', verifyToken, requirePermission(can('vendors', 'update')), vendorController.updateVendor);
vendorRoute.get('/:vendorId/locations', verifyToken, requirePermission() /* lookup: any signed-in user */, vendorController.getAllLocations);
vendorRoute.get('/:id', verifyToken, requirePermission(can('vendors', 'view')), vendorController.getVendor);
vendorRoute.delete('/:id', verifyToken, requirePermission(can('vendors', 'delete')), vendorController.deleteVendor);

export default vendorRoute;
