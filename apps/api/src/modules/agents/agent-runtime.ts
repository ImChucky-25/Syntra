import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { AppError, NotFoundError, ProviderError } from '../../lib/errors.js';
import { selectModel } from '../ai/chat.service.js';
import { getAdapterForProvider } from '../ai/adapter-registry.js';
import { recordUsage } from '../ai/usage-tracker.js';
import { estimateTokens } from '../ai/context-manager.js';
import { parseToolCalls } from './tool-parser.js';
import { parseToolPolicy, checkToolPermission, ToolCallBudget } from './tool-policy.js';
import { getTool } from './tools/tool.registry.js';
import type { ToolDefinition } from './tools/tool.types.js';
import type { ChatMessage } from '@ai-zone/shared-types';
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
 * Cooperative cancellation (§7.1): flags the run; honored between steps.
 * Returns false when the run does not exist, is not owned by the user,
 * or is not in a cancellable state.
 */
export async function requestCancel(runId: string, userId: string): Promise<boolean> {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, userId } });
  if (!run) return false;
  if (run.status !== 'RUNNING' && run.status !== 'AWAITING_APPROVAL') return false;
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

/**
 * Run an agent (§7.1): model call → (tool calls → model →)* final answer.
 * Bounded by MAX_STEPS model steps and the policy tool budget. When the model
 * requests an approval-gated tool, the run pauses as AWAITING_APPROVAL and the
 * pending ToolExecution is resolved later via the decision endpoint.
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
  const model = await selectModel({
    modelKey: config.modelKey ?? null,
    conversationPreference: null,
    expectedInputTokens: estimateTokens(input, env.contextCharsPerToken),
    userId: config.userId,
  });

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
  const runId = run.id;
  const isCancelled = () => cancelRequested.has(runId);

  try {
    const messages: ChatMessage[] = [
      { role: 'system', content: agent.instructions },
      { role: 'user', content: input },
    ];
    if (policy.allow.length > 0) {
      messages.push({
        role: 'system',
        content:
          'Available tools (request via a fenced agent_tool code block: {"tool": "<name>", "arguments": {...}}).\n' +
          'Allowed tools: ' + policy.allow.join(', ') + '. Other tools are refused by policy.',
      });
    }

    const budget = new ToolCallBudget(policy.maxToolCalls);
    let full = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let wasCancelled = false;

    for (let step = 1; step <= MAX_STEPS; step++) {
      if (isCancelled()) {
        wasCancelled = true;
        break;
      }

      const adapter = getAdapterForProvider(model.provider.adapterKey);
      const output = await withTimeout(
        adapter.generate({
          messages,
          model: model.modelKey,
          temperature: 0.7,
          maxOutputTokens: Math.min(2048, model.maxOutputTokens),
        }),
        policy.timeoutMs,
        'Model call',
      );
      inputTokens += output.inputTokens ?? 0;
      outputTokens += output.outputTokens ?? 0;

      const parsed = parseToolCalls(output.text);
      full += parsed.text;

      if (parsed.toolCalls.length === 0) break; // final answer

      let nextUserTurn = '';
      let pausedForApproval = false;

      for (const call of parsed.toolCalls) {
        if (isCancelled()) {
          wasCancelled = true;
          break;
        }
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
          // §7.1 approval gate: record the request and pause the run.
          await prisma.toolExecution.create({
            data: {
              runId,
              toolName: tool.name,
              input: call.arguments as unknown as Prisma.InputJsonValue,
              status: 'PENDING',
              approvalStatus: 'PENDING',
            },
          });
          await prisma.agentRun.update({ where: { id: runId }, data: { status: 'AWAITING_APPROVAL' } });
          pausedForApproval = true;
          continue;
        }
        nextUserTurn += await runTool(call, tool, runId, config.userId, isCancelled);
      }
      if (wasCancelled) break;

      if (pausedForApproval) {
        return { runId, output: full, status: 'AWAITING_APPROVAL' };
      }

      if (nextUserTurn) {
        messages.push({ role: 'assistant', content: output.text }, { role: 'user', content: nextUserTurn });
      } else {
        break;
      }
    }

    const finalStatus = wasCancelled ? 'CANCELLED' : 'COMPLETED';
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: finalStatus,
        output: full || null,
        inputTokens,
        outputTokens,
        completedAt: new Date(),
      },
    });
    await recordUsage({
      userId: config.userId,
      modelId: model.id,
      inputTokens,
      outputTokens,
      source: 'AGENT',
    });
    return { runId, output: full, status: finalStatus };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Agent run failed';
    logger.error({ err, runId }, 'Agent run failed');
    await prisma.agentRun.update({
      where: { id: runId },
      data: { status: 'FAILED', error: message, completedAt: new Date() },
    });
    if (err instanceof AppError) throw err;
    throw new ProviderError('agent', 'unknown', message, 502);
  }
}

async function runTool(
  call: { tool: string; arguments: Record<string, unknown> },
  tool: ToolDefinition,
  runId: string,
  userId: string,
  isCancelled: () => boolean,
): Promise<string> {
  const started = Date.now();
  const exec = await prisma.toolExecution.create({
    data: { runId, toolName: tool.name, input: call.arguments as unknown as Prisma.InputJsonValue, status: 'RUNNING' },
  });
  try {
    const result = await withTimeout(tool.execute(call.arguments, { userId, runId, isCancelled }), 15_000, `Tool ${tool.name}`);
    const durationMs = Date.now() - started;
    await prisma.toolExecution.update({
      where: { id: exec.id },
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
      where: { id: exec.id },
      data: { status: 'FAILED', error: message, durationMs },
    });
    return `Tool ${tool.name} failed: ${message}`;
  }
}
