import { Router } from "express";
import * as clientController from "../controllers/clientController.js";
import { verifyToken } from "../../../config/jwtConfig.js";
import { uploadMultipleKYC } from "../../../config/multerConfig.js";

const clientRoute = Router();

clientRoute.get("/list", verifyToken, clientController.getClientList);
clientRoute.post("/create", verifyToken, clientController.createClient);
clientRoute.post("/upload-kyc", verifyToken, uploadMultipleKYC, clientController.uploadKYCDocuments);
clientRoute.get("/:clientId", verifyToken, clientController.getClientDetails);
clientRoute.put("/:clientId", verifyToken, clientController.updateClient);
clientRoute.delete("/:clientId", verifyToken, clientController.deleteClient);
clientRoute.delete("/:clientId/kyc/:docId", verifyToken, clientController.deleteKYCDocument);

export default clientRoute;
