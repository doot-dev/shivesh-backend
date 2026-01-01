import { Router } from 'express'
import * as leadController from "../controllers/leadController.js"
import { verifyToken } from '../../../config/jwtConfig.js';

const leadsRoute = Router();

leadsRoute.post('/', verifyToken, leadController.upsertLead);
leadsRoute.get('/by-id', verifyToken, leadController.getLead);
leadsRoute.get('/', verifyToken, leadController.getLeads);
leadsRoute.get('/log', verifyToken, leadController.getActivityLogs);
leadsRoute.put('/log', verifyToken, leadController.updateLead);
leadsRoute.delete('/', verifyToken, leadController.deleteLead);

export default leadsRoute;