/**
 * Tool contracts (spec §7): every tool declares what it does, its JSON-schema-ish
 * parameter shape, and its risk class. Execution happens only through the policy
 * layer — never directly from model output.
 */

export type ToolRisk = 'safe' | 'sensitive';

export interface ToolContext {
  /** Run owner; tools must never act beyond this user's authority. */
  userId: string;
  runId: string;
  /** Cooperative cancel signal checked by long-running tools. */
  isCancelled: () => boolean;
}

export interface ToolParameterSchema {
  type: 'object';
  properties: Record<string, { type: string; description: string }>;
  required?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  risk: ToolRisk;
  parameters: ToolParameterSchema;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}
