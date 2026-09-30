import type { ToolDefinition } from './tool.types.js';
import { builtinTools } from './builtin.tools.js';

const registry = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  registry.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return registry.get(name);
}

for (const tool of builtinTools) {
  registerTool(tool);
}
