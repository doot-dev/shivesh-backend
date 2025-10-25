import { Router } from 'express'
import * as leadController from "../controllers/leadController.js"
const leadsRoute = Router();

leadsRoute
    .post('/', leadController.upsertLead)
    .get('/by-id', leadController.getLead)
    .get('/', leadController.getLeads)
    .get('/log', leadController.getActivityLogs)
    .put('/log', leadController.updateLead)
    .delete('/', leadController.deleteLead)

export default leadsRoute