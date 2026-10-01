import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError, NotFoundError, ProviderError } from '../../lib/errors.js';
import { selectModel } from '../ai/chat.service.js';
import { getAdapterForProvider } from '../ai/adapter-registry.js';
import { recordUsage } from '../ai/usage-tracker.js';
import { estimateTokens } from '../ai/context-manager.js';
import { enforceUsageLimits, getEntitlementSnapshot, isModelAllowed } from '../billing/entitlements.js';
import { parseToolCalls } from './tool-parser.js';
import { parseToolPolicy, checkToolPermission, ToolCallBudget, type ToolPolicy } from './tool-policy.js';
import { getTool } from './tools/tool.registry.js';
import type { ToolDefinition } from './tools/tool.types.js';
import { parseRunTranscript, toolContractMessage, type RunTranscript } from './run-transcript.js';
import type { ChatMessage } from '@syntra/shared-types';
import type { AiModel, AiProvider, Agent } from '@prisma/client';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/** Bounded execution (spec §7.1): limits every run, regardless of agent. */
export const MAX_STEPS = 5;

export interface AgentRunConfig {
  userId: string;
  agentIdOrKey: string;
  input: string;
  modelKey?: string | null;
}

const cancelRequested = new Set<string>();

/**
 * Cooperative cancellation (§7.1). A RUNNING run is flagged and honored between
 * steps; an AWAITING_APPROVAL run is finalized as CANCELLED immediately since
 * nothing is executing.
 */
export async function requestCancel(runId: string, userId: string): Promise<boolean> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run) return false;
  if (run.status === 'AWAITING_APPROVAL') {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'CANCELLED', completedAt: new Date(), transcript: Prisma.DbNull },
    });
    return true;
  }
  if (run.status !== 'RUNNING') return false;
  cancelRequested.add(runId);
  return true;
}

/** Load an enabled agent by id or key. */
export function loadAgent(agentIdOrKey: string) {
  return prisma.agent.findFirst({
    where: { OR: [{ id: agentIdOrKey }, { key: agentIdOrKey }], enabled: true },
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProviderError('agent', 'timeout', `${label} timed out`, 504)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

interface DriveOptions {
  runId: string;
  userId: string;
  model: AiModel & { provider: AiProvider };
  policy: ToolPolicy;
  /** Transcript at loop entry (includes any pending assistant turn). */
  messages: ChatMessage[];
  /** Snapshot state when resuming; null for a fresh run. */
  transcript: RunTranscript | null;
}

/**
 * The bounded agent loop (§7.1), shared by start and resume:
 * model call → (tool calls → model →)* final answer. Pauses as
 * AWAITING_APPROVAL with a transcript snapshot when an approval-gated tool
 * is requested; resumeAgentRun continues from that snapshot.
 */
async function driveRun(opts: DriveOptions): Promise<{ output: string; status: string }> {
  const { runId, userId, model, policy } = opts;
  const messages: ChatMessage[] = [...opts.messages];
  let full = opts.transcript?.partialOutput ?? '';
  let inputTokens = opts.transcript?.inputTokens ?? 0;
  let outputTokens = opts.transcript?.outputTokens ?? 0;
  const budget = new ToolCallBudget(opts.transcript?.remainingToolCalls ?? policy.maxToolCalls);
  const isCancelled = () => cancelRequested.has(runId);
  const maxOutputTokens = opts.transcript?.maxOutputTokens ?? Math.min(2048, model.maxOutputTokens);

  const finish = async (status: 'COMPLETED' | 'CANCELLED'): Promise<{ output: string; status: string }> => {
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status,
        output: full || null,
        inputTokens,
        outputTokens,
        completedAt: new Date(),
        transcript: Prisma.DbNull,
      },
    });
    await recordUsage({ userId, modelId: model.id, inputTokens, outputTokens, source: 'AGENT' });
    return { output: full, status };
  };

  try {
    for (let step = (opts.transcript?.step ?? 0) + 1; step <= MAX_STEPS; step++) {
      if (isCancelled()) return finish('CANCELLED');

      const adapter = getAdapterForProvider(model.provider.adapterKey);
      const output = await withTimeout(
        adapter.generate({
          messages,
          model: model.modelKey,
          temperature: 0.7,
          maxOutputTokens,
        }),
        policy.timeoutMs,
        'Model call',
      );
      inputTokens += output.inputTokens ?? 0;
      outputTokens += output.outputTokens ?? 0;

      const parsed = parseToolCalls(output.text);
      full += parsed.text;

      if (parsed.toolCalls.length === 0) return finish('COMPLETED'); // final answer

      let nextUserTurn = '';
      let pausedForApproval = false;

      for (const call of parsed.toolCalls) {
        if (isCancelled()) return finish('CANCELLED');
        if (budget.remainingCalls <= 0) {
          nextUserTurn += 'Tool call budget exhausted; produce your final answer now.\n';
          break;
        }
        const tool = getTool(call.tool);
        if (!tool) {
          nextUserTurn += `Tool "${call.tool}" does not exist. Use one of: ${policy.allow.join(', ') || '(none)'}.`;
          continue;
        }
        const perm = checkToolPermission(policy, tool);
        if (!perm.allowed) {
          nextUserTurn += `Tool "${call.tool}" was refused by policy.`;
          continue;
        }
        if (perm.requiresApproval) {
          // §7.1 approval gate: record the request, snapshot the run, pause.
          await prisma.toolExecution.create({
            data: {
              runId,
              toolName: tool.name,
              input: call.arguments as unknown as Prisma.InputJsonValue,
              status: 'PENDING',
              approvalStatus: 'PENDING',
            },
          });
          const snapshot: RunTranscript = {
            messages: [...messages, { role: 'assistant', content: output.text }],
            partialOutput: full,
            remainingToolCalls: budget.remainingCalls,
            step,
            inputTokens,
            outputTokens,
            modelKey: model.modelKey,
            maxOutputTokens,
          };
          await prisma.agentRun.update({
            where: { id: runId },
            data: {
              status: 'AWAITING_APPROVAL',
              transcript: snapshot as unknown as Prisma.InputJsonValue,
            },
          });
          pausedForApproval = true;
          continue;
        }
        nextUserTurn += await runTool(call, tool, runId, userId, isCancelled);
      }
      if (pausedForApproval) {
        return { output: full, status: 'AWAITING_APPROVAL' };
      }

      if (nextUserTurn) {
        messages.push({ role: 'assistant', content: output.text }, { role: 'user', content: nextUserTurn });
      } else {
        break;
      }
    }

    full += '\n\n(agent stopped: step limit reached)';
    return finish('COMPLETED');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Agent run failed';
    logger.error({ err, runId }, 'Agent run failed');
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'FAILED', error: message, completedAt: new Date(), transcript: Prisma.DbNull },
    });
    if (err instanceof AppError) throw err;
    throw new ProviderError('agent', 'unknown', message, 502);
  }
}

/**
 * Start a run (§7.1): load agent, route model, create the run, enter the loop.
 */
export async function executeAgentRun(
  config: AgentRunConfig,
): Promise<{ runId: string; output: string; status: string }> {
  const agent = await loadAgent(config.agentIdOrKey);
  if (!agent) throw new NotFoundError('Agent not found');
  const input = config.input.trim();
  if (!input) throw new ProviderError('agent', 'invalid_request', 'Agent input is empty', 400);
  if (input.length > 32_000) throw new ProviderError('agent', 'invalid_request', 'Agent input too long', 400);

  const policy = parseToolPolicy(agent.toolPolicy);
  await enforceUsageLimits(config.userId);
  const model = await selectModel({
    modelKey: config.modelKey ?? null,
    conversationPreference: null,
    expectedInputTokens: estimateTokens(input, env.contextCharsPerToken),
    userId: config.userId,
  });
  const entitlement = await getEntitlementSnapshot(config.userId);
  if (!isModelAllowed(entitlement.limits, model.modelKey)) {
    throw new ProviderError('agent', 'invalid_request', `Model "${model.modelKey}" is not included in the ${entitlement.planName} plan`, 403);
  }

  const run = await prisma.agentRun.create({
    data: {
      userId: config.userId,
      agentId: agent.id,
      agentVersion: agent.version,
      status: 'RUNNING',
      input,
      modelId: model.id,
    },
  });

  const messages: ChatMessage[] = [
    { role: 'system', content: agent.instructions },
    { role: 'user', content: input },
  ];
  if (policy.allow.length > 0) {
    messages.push(toolContractMessage(policy.allow));
  }

  const result = await driveRun({ runId: run.id, userId: config.userId, model, policy, messages, transcript: null });
  return { runId: run.id, ...result };
}

/**
 * Resume an AWAITING_APPROVAL run after its pending tool executions have been
 * decided (approve/reject). Claims the run atomically (status flip + snapshot
 * clear in one updateMany) so a double-resume is a 409, never a double model run.
 * Returns null when the run does not exist or is not awaiting a decision.
 */
export async function resumeAgentRun(
  runId: string,
  userId: string,
): Promise<{ output: string; status: string } | null> {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId },
    include: { toolExecutions: { where: { approvalStatus: { in: ['PENDING', 'APPROVED'] } } } },
  });
  if (!run || run.status !== 'AWAITING_APPROVAL' || !run.transcript) return null;

  const approved = run.toolExecutions.filter((t) => t.approvalStatus === 'APPROVED');
  const stillPending = run.toolExecutions.filter((t) => t.approvalStatus === 'PENDING');
  if (stillPending.length > 0) {
    // Every pending tool must be decided before resuming.
    throw new ProviderError('agent', 'invalid_request', 'Run still has undecided tool approvals', 409);
  }
  if (approved.length === 0) {
    // Nothing approved: rejection-only resume just finalizes the run.
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        transcript: Prisma.DbNull,
        output: (run.output ?? '') + '\n\n(agent stopped: tool use was rejected)',
      },
    });
    return { output: run.output ?? '', status: 'COMPLETED' };
  }

  const transcript = parseRunTranscript(run.transcript);

  // Atomic claim: flip status and drop the snapshot together. If another
  // resume already did this, count is 0 and we refuse (409 upstream).
  const claimed = await prisma.agentRun.updateMany({
    where: { id: runId, userId, status: 'AWAITING_APPROVAL' },
    data: { status: 'RUNNING', transcript: Prisma.DbNull },
  });
  if (claimed.count !== 1) {
    throw new ProviderError('agent', 'invalid_request', 'Run is not awaiting approval', 409);
  }

  // Resolve the model the run started with; fail loudly if it vanished.
  const model = run.modelId
    ? await prisma.aiModel.findUnique({
        where: { id: run.modelId },
        include: { provider: true },
      })
    : null;
  if (!model || !model.enabled) {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'FAILED', error: 'Run model is no longer available', completedAt: new Date() },
    });
    throw new ProviderError('agent', 'availability', 'Run model is no longer available', 503);
  }

  // Apply the agent's CURRENT policy (tightenings take effect on resume).
  const agent: Agent | null = await prisma.agent.findUnique({ where: { id: run.agentId } });
  if (!agent || !agent.enabled) {
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'FAILED', error: 'Agent is no longer available', completedAt: new Date() },
    });
    throw new ProviderError('agent', 'availability', 'Agent is no longer available', 503);
  }
  const policy = parseToolPolicy(agent.toolPolicy);

  // Execute approved tools, feeding results back as the next user turn.
  const isCancelled = () => cancelRequested.has(runId);
  let decisionTurn = '';
  for (const exec of approved) {
    if (isCancelled()) break;
    const tool = getTool(exec.toolName);
    if (!tool) {
      decisionTurn += `Tool "${exec.toolName}" no longer exists.\n`;
      continue;
    }
    if (transcript.remainingToolCalls <= 0) {
      decisionTurn += 'Tool call budget exhausted; produce your final answer now.\n';
      break;
    }
    transcript.remainingToolCalls -= 1;
    const args = (exec.input ?? {}) as Record<string, unknown>;
    decisionTurn += await runTool({ tool: exec.toolName, arguments: args }, tool, runId, userId, isCancelled, exec.id);
  }

  const messages: ChatMessage[] = [...transcript.messages, { role: 'user', content: decisionTurn }];
  const result = await driveRun({
    runId,
    userId,
    model: model as AiModel & { provider: AiProvider },
    policy,
    messages,
    transcript,
  });
  return result;
}

async function runTool(
  call: { tool: string; arguments: Record<string, unknown> },
  tool: ToolDefinition,
  runId: string,
  userId: string,
  isCancelled: () => boolean,
  existingExecId?: string,
): Promise<string> {
  const started = Date.now();
  let execId = existingExecId;
  if (!execId) {
    const exec = await prisma.toolExecution.create({
      data: { runId, toolName: tool.name, input: call.arguments as unknown as Prisma.InputJsonValue, status: 'RUNNING' },
    });
    execId = exec.id;
  } else {
    await prisma.toolExecution.update({ where: { id: execId }, data: { status: 'RUNNING' } });
  }
  try {
    const result = await withTimeout(tool.execute(call.arguments, { userId, runId, isCancelled }), 15_000, `Tool ${tool.name}`);
    const durationMs = Date.now() - started;
    await prisma.toolExecution.update({
      where: { id: execId },
      data: {
        output: result as unknown as object,
        status: result.ok ? 'SUCCEEDED' : 'FAILED',
        durationMs,
        error: result.ok ? null : (result.error ?? 'tool reported failure'),
      },
    });
    const payload = result.ok ? JSON.stringify(result.data ?? null) : (result.error ?? 'failure');
    return `Tool ${tool.name} ${result.ok ? 'result' : 'error'}: ${payload}`;
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : 'unknown tool error';
    await prisma.toolExecution.update({
      where: { id: execId },
      data: { status: 'FAILED', error: message, durationMs },
    });
    return `Tool ${tool.name} failed: ${message}`;
  }
}
