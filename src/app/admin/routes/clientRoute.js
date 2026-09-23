import { Router } from "express";
import * as clientController from "../controllers/clientController.js";
import { verifyToken } from "../../../config/jwtConfig.js";
import { uploadMultipleKYC } from "../../../config/multerConfig.js";
import { requirePermission, can } from "../../../helper/accessControl.js";

const clientRoute = Router();

clientRoute.get("/list", verifyToken, requirePermission(can('clients', 'view')), clientController.getClientList);
clientRoute.post("/create", verifyToken, requirePermission(can('clients', 'create')), clientController.createClient);
clientRoute.post("/upload-kyc", verifyToken, requirePermission(can('clients', 'update')), uploadMultipleKYC, clientController.uploadKYCDocuments);
clientRoute.get("/kyc-list", verifyToken, requirePermission(can('clients', 'view')), clientController.getKYCList);
clientRoute.get("/:clientId", verifyToken, requirePermission(can('clients', 'view')), clientController.getClientDetails);
clientRoute.put("/update", verifyToken, requirePermission(can('clients', 'update')), clientController.updateClient);
clientRoute.delete("/:clientId/kyc/:docId", verifyToken, requirePermission(can('clients', 'update')), clientController.deleteKYCDocument);
clientRoute.delete("/:clientId", verifyToken, requirePermission(can('clients', 'delete')), clientController.deleteClient);

export default clientRoute;
