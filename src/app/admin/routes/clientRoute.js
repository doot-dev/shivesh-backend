import { Router } from "express";
import * as clientController from "../controllers/clientController.js";
import { verifyToken } from "../../../config/jwtConfig.js";

const clientRoute = Router();

// 🔵 1. GET CLIENT LIST
clientRoute.get("/list", verifyToken, clientController.getClientList);

// 🔵 2. CREATE CLIENT
clientRoute.post("/create", verifyToken, clientController.createClient);

// 🔵 6. UPLOAD MULTIPLE KYC DOCUMENTS
clientRoute.post("/upload-kyc", verifyToken, clientController.uploadKYCDocuments);

// 🔵 3. GET CLIENT DETAILS
clientRoute.get("/:clientId", verifyToken, clientController.getClientDetails);

// 🔵 4. UPDATE CLIENT
clientRoute.put("/:clientId", verifyToken, clientController.updateClient);

// 🔵 5. DELETE CLIENT
clientRoute.delete("/:clientId", verifyToken, clientController.deleteClient);

// 🔵 7. DELETE ONE KYC DOCUMENT
clientRoute.delete("/:clientId/kyc/:docId", verifyToken, clientController.deleteKYCDocument);

export default clientRoute;
