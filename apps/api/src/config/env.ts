import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';

/** Walk upward from cwd to find the repo-root .env (workspaces run in subdirs). */
function findEnvFile(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

dotenv.config({ path: findEnvFile() });

function read(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  warnIfNeeded(name, v ?? '');
  return v ?? '';
}

function warnIfNeeded(name: string, value: string): void {
  // Surface weak security-critical values early instead of failing hard in dev.
  if (name === 'JWT_SECRET' && (value === 'change-me-to-a-long-random-secret' || value.length < 32)) {
    console.warn('[ai-zone] WARNING: JWT_SECRET is missing or too short — generate one for real use.');
  }
  if (name === 'OPENAI_API_KEY' && !value) {
    console.warn('[ai-zone] OPENAI_API_KEY is not set — chat requests will fail until a key is configured.');
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.PORT ?? 4000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl: read('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/ai_zone'),
  jwtSecret: read('JWT_SECRET', 'change-me-to-a-long-random-secret'),
  accessTokenTtlHours: Number(process.env.ACCESS_TOKEN_TTL_HOURS ?? 72),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL,
  // Required when using an unscoped (user-level) Anthropic API key.
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? '',
  // DeepSeek exposes an OpenAI-compatible API; the OpenAI adapter is reused.
  deepseekApiKey: process.env.DEEPSEEK_API_KEY ?? '',
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  contextCharsPerToken: Number(process.env.CONTEXT_CHARS_PER_TOKEN ?? 4),
  contextMaxInputTokens: Number(process.env.CONTEXT_MAX_INPUT_TOKENS ?? 12_000),
};
