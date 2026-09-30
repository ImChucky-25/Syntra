import { z } from 'zod';

/**
 * Serializable snapshot of an in-flight agent run, persisted when the run
 * pauses for tool approval (spec §7.1) and consumed by resumeAgentRun.
 * Kept explicit + validated so a corrupted snapshot fails loudly, not silently.
 */

const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().max(200_000),
});

export const runTranscriptSchema = z.object({
  /** Conversation so far, including the tool-protocol system message. */
  messages: z.array(messageSchema).max(100),
  /** Text portions of model answers collected before the pause. */
  partialOutput: z.string().max(200_000).default(''),
  /** Tool-call budget remaining at pause time. */
  remainingToolCalls: z.number().int().min(0).max(50),
  /** Model step the run paused on (1-based); resumed after this step. */
  step: z.number().int().min(1).max(10),
  /** Usage accrued before the pause. */
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  /** Routing key of the model the run started with. */
  modelKey: z.string().max(120),
  /** Max output tokens passed to adapter calls. */
  maxOutputTokens: z.number().int().min(1).max(32_000),
});

export type RunTranscript = z.infer<typeof runTranscriptSchema>;

/** Validate an unknown JSON value (e.g. Prisma Json column) into a transcript. */
export function parseRunTranscript(raw: unknown): RunTranscript {
  const result = runTranscriptSchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Stored run transcript is invalid');
  }
  return result.data;
}

/** Helper for building the tool-protocol system message consistently. */
export function toolContractMessage(allowedTools: string[]): { role: 'system'; content: string } {
  return {
    role: 'system',
    content:
      'Available tools (request via a fenced agent_tool code block: {"tool": "<name>", "arguments": {...}}).\n' +
      'Allowed tools: ' + (allowedTools.join(', ') || '(none)') + '. Other tools are refused by policy.',
  };
}
