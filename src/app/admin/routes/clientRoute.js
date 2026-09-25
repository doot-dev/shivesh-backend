import { Router } from "express";
import * as pc from '../controllers/paymentController.js';
import * as clientController from "../controllers/clientController.js";
import * as clientAccess from '../controllers/clientAccessController.js';
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

// Phase 2: client account, ledger, credit settings (W24) and extra credit (W35).
clientRoute.get("/:clientId/account", verifyToken, requirePermission(can('payments', 'view'), can('billing', 'view')), pc.clientAccount);
clientRoute.get("/:clientId/ledger", verifyToken, requirePermission(can('payments', 'view'), can('billing', 'view')), pc.clientLedger);
clientRoute.put("/:clientId/credit", verifyToken, requirePermission(can('clients', 'update')), pc.updateClientCredit);
clientRoute.post("/:clientId/credit-extra", verifyToken, requirePermission(can('orders', 'approve')), pc.grantExtraCredit);
clientRoute.post("/:clientId/credit-extra/:id/revoke", verifyToken, requirePermission(can('orders', 'approve')), pc.revokeExtraCredit);

// docs/06: the client's Team — contacts who log in to the client app.
clientRoute.get("/:clientId/contacts", verifyToken, requirePermission(can('clients', 'view')), clientAccess.listClientContacts);
clientRoute.post("/:clientId/contacts", verifyToken, requirePermission(can('clients', 'update')), clientAccess.createClientContact);
clientRoute.put("/:clientId/contacts/:contactId", verifyToken, requirePermission(can('clients', 'update')), clientAccess.updateClientContact);
clientRoute.delete("/:clientId/contacts/:contactId", verifyToken, requirePermission(can('clients', 'update')), clientAccess.deleteClientContact);

export default clientRoute;
