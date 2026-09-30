import { z } from 'zod';
import type { ToolDefinition } from './tools/tool.types.js';
import { getTool } from './tools/tool.registry.js';
import { ProviderError } from '../../lib/errors.js';

/**
 * Permission layer (spec §7.1): model output never grants permissions.
 * The agent's versioned tool policy is the single source of truth for what
 * may run, what needs approval, and how many calls a run may make.
 */

export const toolPolicySchema = z.object({
  allow: z.array(z.string()).default([]),
  requireApproval: z.array(z.string()).default([]),
  maxToolCalls: z.number().int().min(0).max(50).default(6),
  timeoutMs: z.number().int().min(1_000).max(600_000).default(60_000),
});

export type ToolPolicy = z.infer<typeof toolPolicySchema>;

/** Parse untrusted JSON (e.g. from DB Json field) into a validated policy. */
export function parseToolPolicy(raw: unknown): ToolPolicy {
  const result = toolPolicySchema.safeParse(raw);
  if (!result.success) {
    throw new ProviderError('agent', 'invalid_request', 'Agent tool policy is invalid', 500);
  }
  return result.data;
}

export type PermissionCheck =
  | { allowed: true; requiresApproval: boolean }
  | { allowed: false; reason: string };

export function checkToolPermission(policy: ToolPolicy, tool: ToolDefinition): PermissionCheck {
  if (!policy.allow.includes(tool.name)) {
    return { allowed: false, reason: `tool "${tool.name}" is not allowed by agent policy` };
  }
  // Policy can only escalate risk to approval, never de-escalate it (§7.1).
  const requiresApproval = tool.risk === 'sensitive' || policy.requireApproval.includes(tool.name);
  return { allowed: true, requiresApproval };
}

export class ToolCallBudget {
  private remaining: number;

  constructor(maxCalls: number) {
    this.remaining = maxCalls;
  }

  tryConsume(toolName: string): void {
    if (this.remaining <= 0) {
      throw new ProviderError(
        'agent',
        'invalid_request',
        `Tool call budget exhausted (limit ${this.remaining + 0}; refusing further calls such as "${toolName}")`,
        429,
      );
    }
    this.remaining -= 1;
  }

  get remainingCalls(): number {
    return this.remaining;
  }
}
