import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { startAgentRunSchema, toolDecisionSchema } from '@syntra/validation';
import { executeAgentRun, requestCancel, resumeAgentRun } from './agent-runtime.js';
import { parseToolPolicy } from './tool-policy.js';

/** GET /api/v1/agents — public catalog of enabled agents with sanitized policies. */
export async function listAgents(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const agents = await prisma.agent.findMany({
      where: { enabled: true },
      orderBy: { key: 'asc' },
    });
    res.json({
      agents: agents.map((a) => {
        const policy = parseToolPolicy(a.toolPolicy);
        return {
          id: a.id,
          key: a.key,
          name: a.name,
          version: a.version,
          description: a.instructions.slice(0, 200),
          tools: policy.allow,
          maxToolCalls: policy.maxToolCalls,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/v1/agents/:id/runs — start a run (id may be the agent key). */
export async function startRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const parsed = startAgentRunSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid run request', parsed.error.flatten());
    }
    const result = await executeAgentRun({
      userId: user.id,
      agentIdOrKey: req.params.id as string,
      input: parsed.data.input,
      modelKey: parsed.data.modelKey ?? null,
    });
    res.status(202).json({
      run: {
        id: result.runId,
        status: result.status,
        output: result.output,
      },
    });
  } catch (err) {
    next(err);
  }
}

const runIdSchema = z.string().uuid();

/** GET /api/v1/runs/:id — run status, output, and tool executions (owner only). */
export async function getRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const id = runIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ValidationError('Invalid run id');

    const run = await prisma.agentRun.findFirst({
      where: { id: id.data, userId: user.id },
      include: { toolExecutions: { orderBy: { createdAt: 'asc' } } },
    });
    if (!run) throw new NotFoundError('Run not found');

    res.json({
      run: {
        id: run.id,
        status: run.status,
        agentId: run.agentId,
        agentVersion: run.agentVersion,
        input: run.input,
        output: run.output,
        error: run.error,
        inputTokens: run.inputTokens,
        outputTokens: run.outputTokens,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        toolExecutions: run.toolExecutions.map((t) => ({
          id: t.id,
          toolName: t.toolName,
          status: t.status,
          approvalStatus: t.approvalStatus,
          durationMs: t.durationMs,
          error: t.error,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/v1/runs/:id/cancel — cooperative cancellation (owner only). */
export async function cancelRun(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const id = runIdSchema.safeParse(req.params.id);
    if (!id.success) throw new ValidationError('Invalid run id');

    const ok = await requestCancel(id.data, user.id);
    if (!ok) throw new NotFoundError('Cancellable run not found');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/** POST /api/v1/runs/:id/tools/:toolId — approve or reject a pending tool (owner only). */
export async function decideTool(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const runId = runIdSchema.safeParse(req.params.id);
    const toolId = z.string().uuid().safeParse(req.params.toolId);
    if (!runId.success || !toolId.success) throw new ValidationError('Invalid id');
    const parsed = toolDecisionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid decision payload');

    const run = await prisma.agentRun.findFirst({ where: { id: runId.data, userId: user.id } });
    if (!run) throw new NotFoundError('Run not found');

    const exec = await prisma.toolExecution.findFirst({
      where: { id: toolId.data, runId: run.id, approvalStatus: 'PENDING' },
    });
    if (!exec) throw new NotFoundError('Pending tool execution not found');

    if (parsed.data.decision === 'approve') {
      await prisma.toolExecution.update({
        where: { id: exec.id },
        data: { approvalStatus: 'APPROVED' },
      });
    } else {
      await prisma.toolExecution.update({
        where: { id: exec.id },
        data: { approvalStatus: 'REJECTED', status: 'FAILED', error: 'rejected by user' },
      });
    }

    // Once every pending tool has a decision, resume the paused run.
    const undecided = await prisma.toolExecution.count({
      where: { runId: run.id, approvalStatus: 'PENDING' },
    });
    if (undecided > 0) {
      res.status(202).json({
        ok: true,
        decision: parsed.data.decision,
        run: { id: run.id, status: 'AWAITING_APPROVAL', undecided },
      });
      return;
    }
    const result = await resumeAgentRun(run.id, user.id);
    res.json({
      ok: true,
      decision: parsed.data.decision,
      run: { id: run.id, status: result?.status ?? 'COMPLETED', output: result?.output ?? null },
    });
  } catch (err) {
    next(err);
  }
}
