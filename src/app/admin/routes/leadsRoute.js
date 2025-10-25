import { Router } from 'express'
import * as leadController from "../controllers/leadController.js"
import { verifyToken } from '../../../config/jwtConfig.js';
const leadsRoute = Router();

leadsRoute
    .post('/', verifyToken, leadController.upsertLead)
    .get('/by-id', leadController.getLead)
    .get('/', leadController.getLeads)
    .get('/log', leadController.getActivityLogs)
    .put('/log', verifyToken, leadController.updateLead)
    .delete('/', verifyToken, leadController.deleteLead)

export default leadsRoute