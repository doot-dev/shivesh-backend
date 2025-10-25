import { Router } from 'express'
import * as leadController from "../controllers/leadController.js"
const leadsRoute = Router();

leadsRoute
    .post('/', leadController.upsertLead)
    .get('/', leadController.getLeads)
    .delete('/', leadController.deleteLead)

export default leadsRoute