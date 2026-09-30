import { Router } from 'express';
import { getRun, cancelRun, decideTool } from './agents.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';

const router = Router();
router.use(requireAuth);
router.get('/:id', getRun);
router.post('/:id/cancel', cancelRun);
router.post('/:id/tools/:toolId', decideTool);

export default router;
