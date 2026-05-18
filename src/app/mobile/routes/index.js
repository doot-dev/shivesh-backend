import { Router } from 'express';
import clientAuthRoute from './clientAuthRoute.js';
import techAuthRoute from './techAuthRoute.js';
import clientRoute from './clientRoute.js';
import techRoute from './techRoute.js';

const router = Router();

router.use('/client/auth', clientAuthRoute);
router.use('/tech/auth', techAuthRoute);
router.use('/client', clientRoute);
router.use('/tech', techRoute);

export default router;
