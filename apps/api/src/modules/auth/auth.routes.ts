import { Router } from 'express';
import { register, login, logout, me } from './auth.controller.js';
import { requireAuth } from '../../middleware/auth.middleware.js';
import { rateLimit } from '../../middleware/rate-limit.js';

const router = Router();

router.post('/register', rateLimit({ windowMs: 60_000, max: 10, name: 'register' }), register);
router.post('/login', rateLimit({ windowMs: 60_000, max: 20, name: 'login' }), login);
router.post('/logout', logout);
router.get('/me', requireAuth, me);

export default router;
