import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import authRoutes from './modules/auth/auth.routes.js';
import conversationsRoutes from './modules/conversations/conversations.routes.js';
import { listModels } from './modules/models/models.controller.js';
import { getUsageSummary } from './modules/usage/usage.controller.js';
import { getPreferences, updatePreferences } from './modules/preferences/preferences.controller.js';
import agentsRoutes from './modules/agents/agents.routes.js';
import runsRoutes from './modules/agents/runs.routes.js';
import filesRoutes from './modules/files/files.routes.js';
import { analyzeDocument } from './modules/files/documents.controller.js';
import adminRoutes from './modules/admin/admin.routes.js';
import { getSubscription } from './modules/billing/billing.controller.js';
import { handleChatStream } from './modules/ai/chat.controller.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { rateLimit } from './middleware/rate-limit.js';
import { notFoundHandler, errorHandler } from './middleware/error-handler.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(
    cors({
      origin: env.corsOrigin.split(',').map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.set('trust proxy', 1);

  app.get('/health', async (_req, res) => {
    // Liveness + DB readiness probe (used by Docker/compose healthchecks).
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
    } catch {
      res.status(503).json({ status: 'degraded', db: 'down', time: new Date().toISOString() });
    }
  });

  const v1 = express.Router();
  v1.use('/auth', authRoutes);
  v1.use('/conversations', conversationsRoutes);
  v1.get('/models', requireAuth, listModels);
  v1.get('/usage', requireAuth, getUsageSummary);
  v1.get('/subscriptions', requireAuth, getSubscription);
  v1.get('/preferences', requireAuth, getPreferences);
  v1.patch('/preferences', requireAuth, updatePreferences);
  v1.use('/agents', agentsRoutes);
  v1.use('/runs', runsRoutes);
  v1.use('/files', filesRoutes);
  v1.post('/documents/:id/analyze', requireAuth, analyzeDocument);
  v1.use('/admin', adminRoutes);
  v1.post('/chat/stream', requireAuth, rateLimit({ windowMs: 60_000, max: 30, name: 'chat' }), handleChatStream);

  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
