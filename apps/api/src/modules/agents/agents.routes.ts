import { Router } from 'express';
import { listAgents, startRun } from './agents.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.js';

const router = Router();

// Catalog is public; runs are per-user.
router.get('/', listAgents);
router.post('/:id/runs', requireAuth, rateLimit({ windowMs: 60_000, max: 10, name: 'agent-run' }), startRun);

export default router;
