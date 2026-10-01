import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { selectModel } from '../ai/chat.service.js';
import { getAdapterForProvider } from '../ai/adapter-registry.js';
import { recordUsage } from '../ai/usage-tracker.js';
import { estimateTokens } from '../ai/context-manager.js';
import { env } from '../../config/env.js';

/**
 * Document Intelligence (spec §4.4, §9.1 POST /documents/:id/analyze).
 * Runs model analysis over previously uploaded + extracted file text.
 * The id in the path is a File id; compare mode accepts additional ids in the body.
 */

const analyzeSchema = z.object({
  task: z.enum(['summarize', 'extract', 'question', 'compare']),
  question: z.string().trim().max(2_000).optional(),
  /** Extra document ids for compare (the path id counts as the first). */
  documentIds: z.array(z.string().uuid()).max(2).optional(),
  modelKey: z.string().max(120).optional(),
});

const CONTEXT_CHAR_BUDGET = 48_000; // ≈12k tokens at 4 chars/token

const TASK_PROMPTS: Record<string, string> = {
  summarize: 'Summarize the following document. Capture purpose, key points, and any conclusions or action items.',
  extract: 'Extract the key structured facts from the following document (names, dates, figures, obligations). Output as a concise list.',
  question: 'Answer the user question using only the document content below. If the answer is not in the document, say so explicitly.',
  compare: 'Compare the documents below: shared themes, contradictions, and notable differences. Attribute points to their document.',
};

/** POST /api/v1/documents/:id/analyze */
export async function analyzeDocument(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ValidationError('Invalid document id');
    const parsed = analyzeSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid analyze request', parsed.error.flatten());
    const { task, question, documentIds, modelKey } = parsed.data;
    if (task === 'question' && !question) {
      throw new ValidationError('question is required for the question task');
    }

    const wantedIds = [id.data, ...(documentIds ?? [])];
    const files = await prisma.file.findMany({
      where: { id: { in: wantedIds }, userId: user.id },
    });
    if (files.length !== wantedIds.length) {
      throw new NotFoundError('One or more documents were not found');
    }
    const ready = files.filter((f) => f.extractedText && f.extractedText.trim().length > 0);
    if (ready.length === 0) {
      throw new ValidationError('Documents have no extractable text');
    }

    // Proportional char budget per document keeps multi-doc compare bounded.
    const perDocChars = Math.floor(CONTEXT_CHAR_BUDGET / ready.length);
    const docBlocks = ready.map((f) => {
      const text = (f.extractedText ?? '').slice(0, perDocChars);
      return `<document name="${f.filename}">\n${text}${(f.extractedText ?? '').length > perDocChars ? '\n[truncated]' : ''}\n</document>`;
    });

    const system =
      'You are Syntra\'s document analysis engine. Work only from the provided documents; ' +
      'distinguish document facts from your own analysis.';
    const userContent =
      TASK_PROMPTS[task] +
      (task === 'question' ? `\n\nQuestion: ${question}` : '') +
      '\n\n' +
      docBlocks.join('\n\n');

    const model = await selectModel({
      modelKey: modelKey ?? null,
      conversationPreference: null,
      expectedInputTokens: estimateTokens(userContent, env.contextCharsPerToken),
      userId: user.id,
    });
    const adapter = getAdapterForProvider(model.provider.adapterKey);
    const output = await adapter.generate({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      model: model.modelKey,
      temperature: 0.3,
      maxOutputTokens: Math.min(2048, model.maxOutputTokens),
    });

    await recordUsage({
      userId: user.id,
      modelId: model.id,
      inputTokens: output.inputTokens ?? 0,
      outputTokens: output.outputTokens ?? 0,
      source: 'AGENT',
    });

    res.json({
      analysis: {
        documents: ready.map((f) => ({ id: f.id, filename: f.filename })),
        task,
        answer: output.text,
        model: model.modelKey,
        inputTokens: output.inputTokens ?? null,
        outputTokens: output.outputTokens ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
}
