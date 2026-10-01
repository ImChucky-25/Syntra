import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import type { ChatStreamEvent } from '@ai-zone/shared-types';
import { buildChatContext, loadConversationForUser } from './chat.service.js';
import { getAdapterForProvider } from './adapter-registry.js';
import { recordUsage } from './usage-tracker.js';
import { enforceUsageLimits, isModelAllowed, getEntitlementSnapshot } from '../billing/entitlements.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

function sseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

export async function handleChatStream(req: Request, res: Response): Promise<void> {
  const send = (event: ChatStreamEvent): void => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  const fail = (status: number, code: string, message: string): void => {
    res.status(status).json({ error: { code, message } });
  };

  try {
    const user = req.user;
    const body = req.body as { conversationId?: string; content?: string; modelKey?: string; title?: string };
    if (!user) {
      fail(401, 'unauthorized', 'Sign in required');
      return;
    }
    if (!body.conversationId || typeof body.content !== 'string' || !body.content.trim()) {
      fail(400, 'validation_error', 'conversationId and content are required');
      return;
    }

    // Server-side entitlement enforcement (spec §12.2: never trust frontend counters).
    await enforceUsageLimits(user.id);

    const ctx = await buildChatContext({
      userId: user.id,
      conversationId: body.conversationId,
      userText: body.content.trim(),
      modelKey: body.modelKey,
    });

    const entitlement = await getEntitlementSnapshot(user.id);
    if (!isModelAllowed(entitlement.limits, ctx.model.modelKey)) {
      fail(403, 'plan_limit', `Model "${ctx.model.modelKey}" is not included in the ${entitlement.planName} plan`);
      return;
    }

    sseHeaders(res);
    const assistantMessageId = crypto.randomUUID();
    send({
      type: 'meta',
      conversationId: ctx.conversation.id,
      userMessageId: ctx.userMessage.id,
      assistantMessageId,
      model: ctx.model.modelKey,
    });

    const adapter = getAdapterForProvider(ctx.model.provider.adapterKey);
    let full = '';
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;

    try {
      for await (const ev of adapter.stream({
        messages: ctx.modelMessages,
        model: ctx.model.modelKey,
        temperature: 0.7,
        maxOutputTokens: Math.min(2048, ctx.model.maxOutputTokens),
      })) {
        if (ev.type === 'delta') {
          full += ev.text;
          send({ type: 'delta', text: ev.text });
        } else if (ev.type === 'usage') {
          inputTokens = ev.inputTokens;
          outputTokens = ev.outputTokens;
        } else if (ev.type === 'error') {
          throw new Error(ev.message);
        }
      }
    } catch (streamErr) {
      logger.error({ err: streamErr }, 'Provider stream failed');
      send({ type: 'error', code: 'provider_error', message: streamErr instanceof Error ? streamErr.message : 'Provider failed' });
      if (full) {
        await prisma.message.create({
          data: { conversationId: ctx.conversation.id, role: 'ASSISTANT', content: full, modelId: ctx.model.id },
        });
      }
      res.end();
      return;
    }

    const tokensIn = inputTokens ?? ctx.estimatedInputTokens;
    const tokensOut = outputTokens ?? Math.ceil(full.length / env.contextCharsPerToken);
    await prisma.message.create({
      data: { id: assistantMessageId, conversationId: ctx.conversation.id, role: 'ASSISTANT', content: full, modelId: ctx.model.id },
    });
    await prisma.conversation.update({
      where: { id: ctx.conversation.id },
      data: { updatedAt: new Date() },
    });
    await recordUsage({
      userId: user.id,
      modelId: ctx.model.id,
      conversationId: ctx.conversation.id,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
    });
    send({ type: 'usage', inputTokens: tokensIn, outputTokens: tokensOut, costAmount: 0 });

    send({ type: 'done', conversationId: ctx.conversation.id });
    res.end();
  } catch (err) {
    logger.error({ err }, 'Chat stream error');
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    const code = (err as { code?: string }).code ?? 'internal_error';
    const message = err instanceof Error ? err.message : 'Chat failed';
    if (res.headersSent) {
      send({ type: 'error', code, message });
      res.end();
    } else {
      res.status(status).json({ error: { code, message } });
    }
  }
}

export async function handleGetConversation(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
    return;
  }
  const conversation = await loadConversationForUser(req.params.id as string, user.id);
  const messages = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json({ conversation, messages });
}
// CHAT_CONTROLLER_END
