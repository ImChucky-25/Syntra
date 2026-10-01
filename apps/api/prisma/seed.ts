/**
 * Seeds the model catalog (spec §4.7 Model Hub). Pricing is stored in the DB
 * so cost calculations use versioned provider pricing, not hardcoded rates (§6.4).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const provider = await prisma.aiProvider.upsert({
    where: { name: 'OpenAI' },
    update: { adapterKey: 'openai', enabled: true, status: 'active' },
    create: { name: 'OpenAI', adapterKey: 'openai', status: 'active', enabled: true },
  });

  const anthropic = await prisma.aiProvider.upsert({
    where: { name: 'Anthropic' },
    update: { adapterKey: 'anthropic', enabled: true, status: 'active' },
    create: { name: 'Anthropic', adapterKey: 'anthropic', status: 'active', enabled: true },
  });

  const models = [
    {
      modelKey: 'gpt-4o-mini',
      displayName: 'GPT-4o mini',
      capabilities: ['chat', 'tools', 'long_context'],
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      costPer1kInput: 0.00015,
      costPer1kOutput: 0.0006,
    },
    {
      modelKey: 'gpt-4o',
      displayName: 'GPT-4o',
      capabilities: ['chat', 'tools', 'code', 'long_context'],
      contextWindow: 128_000,
      maxOutputTokens: 16_384,
      costPer1kInput: 0.0025,
      costPer1kOutput: 0.01,
    },
  ];

  const anthropicModels = [
    {
      modelKey: 'claude-3-5-sonnet-20241022',
      displayName: 'Claude 3.5 Sonnet',
      capabilities: ['chat', 'tools', 'code', 'long_context'],
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      costPer1kInput: 0.003,
      costPer1kOutput: 0.015,
    },
    {
      modelKey: 'claude-3-5-haiku-20241022',
      displayName: 'Claude 3.5 Haiku',
      capabilities: ['chat', 'tools', 'long_context'],
      contextWindow: 200_000,
      maxOutputTokens: 8_192,
      costPer1kInput: 0.0008,
      costPer1kOutput: 0.004,
    },
  ];

  for (const m of models) {
    await prisma.aiModel.upsert({
      where: { providerId_modelKey: { providerId: provider.id, modelKey: m.modelKey } },
      update: {
        displayName: m.displayName,
        capabilities: m.capabilities,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        costPer1kInput: m.costPer1kInput,
        costPer1kOutput: m.costPer1kOutput,
      },
      create: { ...m, providerId: provider.id },
    });
  }

  for (const m of anthropicModels) {
    await prisma.aiModel.upsert({
      where: { providerId_modelKey: { providerId: anthropic.id, modelKey: m.modelKey } },
      update: {
        displayName: m.displayName,
        capabilities: m.capabilities,
        contextWindow: m.contextWindow,
        maxOutputTokens: m.maxOutputTokens,
        costPer1kInput: m.costPer1kInput,
        costPer1kOutput: m.costPer1kOutput,
      },
      create: { ...m, providerId: anthropic.id },
    });
  }

  console.log('Seeded providers + models:', [...models, ...anthropicModels].map((m) => m.modelKey).join(', '));

  await seedAgents();
  await seedPlans();
}

/** Subscription plans with entitlement limits (spec §12.1, §10.2 plans table). */
async function seedPlans(): Promise<void> {
  const plans = [
    {
      key: 'free',
      name: 'Free',
      priceUsd: 0,
      limits: {
        monthlyRequestLimit: 100,
        monthlyTokenLimit: 200_000,
        allowedModels: ['gpt-4o-mini', 'claude-3-5-haiku-20241022'],
        maxFilesPerMonth: 5,
        maxUploadBytes: 10_000_000,
      },
    },
    {
      key: 'pro',
      name: 'Pro',
      priceUsd: 20,
      limits: {
        monthlyRequestLimit: 2_000,
        monthlyTokenLimit: 5_000_000,
        allowedModels: '*',
        maxFilesPerMonth: 200,
        maxUploadBytes: 100_000_000,
      },
    },
    {
      key: 'team',
      name: 'Team',
      priceUsd: 60,
      limits: {
        monthlyRequestLimit: 10_000,
        monthlyTokenLimit: 25_000_000,
        allowedModels: '*',
        maxFilesPerMonth: 1_000,
        maxUploadBytes: 500_000_000,
      },
    },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { key: plan.key },
      update: { name: plan.name, limits: plan.limits, priceUsd: plan.priceUsd, active: true },
      create: plan,
    });
  }

  // Backfill: every user without an active subscription gets Free for the current month.
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const freePlan = await prisma.plan.findUniqueOrThrow({ where: { key: 'free' } });
  const users = await prisma.user.findMany({
    where: { subscriptions: { none: { status: 'active', periodEnd: { gt: now } } } },
    select: { id: true },
  });
  for (const user of users) {
    await prisma.subscription.create({
      data: { userId: user.id, planId: freePlan.id, status: 'active', periodStart, periodEnd },
    });
  }
  console.log('Seeded plans:', plans.map((p) => p.key).join(', '), `(${users.length} users backfilled to Free)`);
}

/** Versioned agent configurations (spec §7, §10.2 — agents table with version + toolPolicy). */
async function seedAgents(): Promise<void> {
  const agents = [
    {
      key: 'general',
      name: 'General Assistant',
      instructions:
        'You are AI Zone\'s general assistant. Answer clearly and concisely. Use the datetime tool when current time matters; otherwise answer directly.',
      toolPolicy: {
        allow: ['datetime', 'calculator', 'text_stats'],
        requireApproval: [],
        maxToolCalls: 4,
        timeoutMs: 60_000,
      },
    },
    {
      key: 'coding',
      name: 'Coding Agent',
      instructions:
        'You are AI Zone\'s coding agent. Explain, generate, debug, and refactor code. Show code in fenced blocks. Use calculator or json_format when they help verify output; say clearly when you have not run any code.',
      toolPolicy: {
        allow: ['calculator', 'json_format', 'text_stats', 'uuid'],
        requireApproval: [],
        maxToolCalls: 6,
        timeoutMs: 90_000,
      },
    },
    {
      key: 'research',
      name: 'Research Agent',
      instructions:
        'You are AI Zone\'s research agent. Structure findings as evidence then analysis, and clearly distinguish sourced facts from your own reasoning. You have no web tool in this environment, so say when an answer would need external sources.',
      toolPolicy: {
        allow: ['datetime', 'text_stats'],
        requireApproval: [],
        maxToolCalls: 3,
        timeoutMs: 120_000,
      },
    },
    {
      key: 'document',
      name: 'Document Agent',
      instructions:
        'You are AI Zone\'s document agent. Summarize, extract, and compare documents the user pastes into the conversation. Use text_stats for length-sensitive summaries.',
      toolPolicy: {
        allow: ['text_stats'],
        requireApproval: [],
        maxToolCalls: 3,
        timeoutMs: 90_000,
      },
    },
    {
      key: 'writing',
      name: 'Writing Agent',
      instructions:
        'You are AI Zone\'s writing agent. Draft and edit professional prose. Use text_stats to check length constraints the user gives you.',
      toolPolicy: {
        allow: ['text_stats', 'datetime'],
        requireApproval: [],
        maxToolCalls: 3,
        timeoutMs: 90_000,
      },
    },
  ];

  for (const agent of agents) {
    const existing = await prisma.agent.findUnique({ where: { key: agent.key } });
    if (!existing) {
      await prisma.agent.create({ data: { ...agent, version: 1, enabled: true } });
      continue;
    }
    const changed =
      existing.name !== agent.name ||
      existing.instructions !== agent.instructions ||
      JSON.stringify(existing.toolPolicy) !== JSON.stringify(agent.toolPolicy);
    if (changed) {
      // Bump version on config change so runs snapshot the config they used (§10.3).
      await prisma.agent.update({
        where: { key: agent.key },
        data: { name: agent.name, instructions: agent.instructions, toolPolicy: agent.toolPolicy, version: { increment: 1 } },
      });
    }
  }
  console.log('Seeded agents:', agents.map((a) => a.key).join(', '));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
