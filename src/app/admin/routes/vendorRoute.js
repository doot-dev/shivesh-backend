import { Router } from 'express'
import * as vendorController from "../controllers/vendorController.js"
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const vendorRoute = Router();

// Handler routes — handlers and locations belong to a vendor, so they are
// gated on the vendor module rather than having modules of their own.
vendorRoute.post('/handlers', verifyToken, requirePermission(can('vendors', 'update')), vendorController.addHandler);
vendorRoute.put('/handlers', verifyToken, requirePermission(can('vendors', 'update')), vendorController.updateHandler);
vendorRoute.get('/handlers/:locationId', verifyToken, requirePermission(can('vendors', 'view')), vendorController.getAllHandlers);
vendorRoute.delete('/handlers/:id', verifyToken, requirePermission(can('vendors', 'update')), vendorController.deleteHandler);

// Location routes
vendorRoute.post('/locations', verifyToken, requirePermission(can('vendors', 'update')), vendorController.addLocation);
vendorRoute.get('/locations/:id', verifyToken, requirePermission(can('vendors', 'view')), vendorController.getLocation);
vendorRoute.put('/locations/', verifyToken, requirePermission(can('vendors', 'update')), vendorController.updateLocation);
vendorRoute.delete('/locations/:id', verifyToken, requirePermission(can('vendors', 'update')), vendorController.deleteLocation);

// Vendor routes
vendorRoute.post('/', verifyToken, requirePermission(can('vendors', 'create')), vendorController.createVendor);
vendorRoute.get('/', verifyToken, requirePermission(can('vendors', 'view')), vendorController.getAllVendors);
vendorRoute.put('/', verifyToken, requirePermission(can('vendors', 'update')), vendorController.updateVendor);
vendorRoute.get('/:vendorId/locations', verifyToken, requirePermission(can('vendors', 'view')), vendorController.getAllLocations);
vendorRoute.get('/:id', verifyToken, requirePermission(can('vendors', 'view')), vendorController.getVendor);
vendorRoute.delete('/:id', verifyToken, requirePermission(can('vendors', 'delete')), vendorController.deleteVendor);

export default vendorRoute;
