import { uploadLeadFile } from '../../../config/leadUploadConfig.js';
import { Router } from 'express'
import * as leadController from "../controllers/leadController.js"
import { verifyToken } from '../../../config/jwtConfig.js';
import { requirePermission, can } from '../../../helper/accessControl.js';

const leadsRoute = Router();

// upsertLead both creates and updates, so it accepts either permission —
// requiring both would stop a create-only user from adding a lead at all.
leadsRoute.post('/', verifyToken, requirePermission(can('leads', 'create'), can('leads', 'update')), leadController.upsertLead);
leadsRoute.get('/by-id', verifyToken, requirePermission(can('leads', 'view')), leadController.getLead);
leadsRoute.get('/', verifyToken, requirePermission(can('leads', 'view')), leadController.getLeads);
leadsRoute.put('/log', verifyToken, requirePermission(can('leads', 'update')), leadController.updateLead);
// The lead's chat: anyone who can open leads reads it; posting needs leads.update.
// The upload runs after the permission check, like every other upload route.
leadsRoute.get('/:leadId/messages', verifyToken, requirePermission(can('leads', 'view')), leadController.listLeadMessages);
leadsRoute.post('/:leadId/messages', verifyToken, requirePermission(can('leads', 'update')), uploadLeadFile, leadController.postLeadMessage);
leadsRoute.delete('/', verifyToken, requirePermission(can('leads', 'delete')), leadController.deleteLead);

export default leadsRoute;
