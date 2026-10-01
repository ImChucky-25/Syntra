import { Router } from 'express';
import { getOverview, listUsers, patchUser, patchModel } from './admin.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { requireAdmin } from './admin.middleware.js';

const router = Router();
router.use(requireAuth, requireAdmin);
router.get('/overview', getOverview);
router.get('/users', listUsers);
router.patch('/users/:id', patchUser);
router.patch('/models/:id', patchModel);

export default router;
