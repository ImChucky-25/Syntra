import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export interface RecordUsageInput {
  userId: string;
  modelId: string | null;
  conversationId?: string | null;
  inputTokens: number;
  outputTokens: number;
  /** Defaults to CHAT; agents record under AGENT. */
  source?: 'CHAT' | 'AGENT' | 'WORKFLOW';
}

/** Persist a usage record, computing cost from DB-stored pricing (spec §6.4). */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  try {
    let cost = 0;
    if (input.modelId) {
      const model = await prisma.aiModel.findUnique({ where: { id: input.modelId } });
      if (model) {
        const costIn = (input.inputTokens / 1000) * Number(model.costPer1kInput);
        const costOut = (input.outputTokens / 1000) * Number(model.costPer1kOutput);
        cost = costIn + costOut;
      }
    }
    await prisma.usageRecord.create({
      data: {
        userId: input.userId,
        modelId: input.modelId,
        conversationId: input.conversationId ?? null,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        costAmount: cost,
        source: input.source ?? 'CHAT',
      },
    });
  } catch (err) {
    // Usage recording must not fail the chat request (spec §6.4)
    logger.error({ err }, 'Failed to record usage');
  }
}
