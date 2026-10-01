import type { AiModel, AiProvider, Conversation, Message as DbMessage } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ProviderError } from '../../lib/errors.js';
import { rankModels } from './model-router.js';
import { buildModelMessages, estimateTokens } from './context-manager.js';
import type { ChatMessage } from '@syntra/shared-types';

export interface ChatContext {
  conversation: Conversation;
  model: AiModel & { provider: AiProvider };
  modelMessages: ChatMessage[];
  userMessage: DbMessage;
  estimatedInputTokens: number;
  truncated: boolean;
}

/** Load conversation with ownership check (spec §10.3: enforce ownership on every access). */
export async function loadConversationForUser(conversationId: string, userId: string): Promise<Conversation> {
  const conversation = await prisma.conversation.findFirst({
    where: { id: conversationId, userId, deletedAt: null },
  });
  if (!conversation) throw new NotFoundError('Conversation not found');
  return conversation;
}

/**
 * Select the model to serve this request: conversation/user preference wins;
 * otherwise capability-aware ranking (spec §6.3).
 */
export async function selectModel(opts: {
  modelKey?: string | null;
  /** Conversation-level preference, if a conversation context exists. */
  conversationPreference?: string | null;
  expectedInputTokens?: number;
  /** Used to fall back to the user's saved default model (Model Hub). */
  userId?: string;
}): Promise<AiModel & { provider: AiProvider }> {
  let preferred = opts.modelKey ?? opts.conversationPreference ?? null;
  if (!preferred && opts.userId) {
    const prefs = await prisma.userPreference.findUnique({ where: { userId: opts.userId } });
    preferred = prefs?.defaultModelKey ?? null;
  }
  const candidates = await prisma.aiModel.findMany({
    where: { enabled: true, provider: { enabled: true, status: 'active' } },
    include: { provider: true },
  });
  if (candidates.length === 0) {
    throw new ProviderError('router', 'availability', 'No enabled AI models are configured', 503);
  }
  if (preferred) {
    const match = candidates.find((m) => m.modelKey === preferred);
    if (match) return match;
    // Explicit choice that is unknown/disabled → clear error (spec §6.3 "Manual")
    throw new ProviderError('router', 'invalid_request', `Model "${preferred}" is not available`, 400);
  }
  const ranked = rankModels(candidates, {
    taskKind: 'general',
    expectedInputTokens: opts.expectedInputTokens,
  });
  const best = ranked[0];
  if (!best) throw new ProviderError('router', 'availability', 'Routing found no eligible model', 503);
  return best.model;
}

export async function buildChatContext(opts: {
  userId: string;
  conversationId: string;
  userText: string;
  modelKey?: string | null;
}): Promise<ChatContext> {
  const conversation = await loadConversationForUser(opts.conversationId, opts.userId);

  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  const modelMessages: ChatMessage[] = history.map((m) => ({
    role: m.role === 'USER' ? 'user' : m.role === 'ASSISTANT' ? 'assistant' : 'system',
    content: m.content,
  }));
  // Append the new user message to the persisted history view
  const pending: ChatMessage[] = [...modelMessages, { role: 'user', content: opts.userText }];

  const budgeted = buildModelMessages({
    history: pending,
    charsPerToken: env.contextCharsPerToken,
    maxInputTokens: env.contextMaxInputTokens,
  });

  const model = await selectModel({
    modelKey: opts.modelKey,
    conversationPreference: conversation.modelPreference,
    expectedInputTokens: budgeted.estimatedInputTokens,
    userId: opts.userId,
  });

  const userMessage = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      role: 'USER',
      content: opts.userText,
    },
  });

  return {
    conversation,
    model,
    modelMessages: budgeted.messages,
    userMessage,
    estimatedInputTokens: budgeted.estimatedInputTokens,
    truncated: budgeted.truncated,
  };
}

export { buildModelMessages, estimateTokens };
