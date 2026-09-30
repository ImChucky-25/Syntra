import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { createConversationSchema, updateConversationSchema } from '@ai-zone/validation';

export async function listConversations(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new NotFoundError('Unauthorized');
    // History search (spec §4.1): q matches titles and message content.
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 120) : '';
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: req.user.id,
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' as const } },
                { messages: { some: { content: { contains: q, mode: 'insensitive' as const } } } },
              ],
            }
          : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: { _count: { select: { messages: true } } },
    });
    res.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        modelPreference: c.modelPreference,
        messageCount: c._count.messages,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function createConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new NotFoundError('Unauthorized');
    const parsed = createConversationSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ValidationError('Invalid conversation data', parsed.error.flatten());
    const conversation = await prisma.conversation.create({
      data: {
        userId: req.user.id,
        title: parsed.data.title ?? 'New conversation',
        modelPreference: parsed.data.modelPreference ?? null,
      },
    });
    res.status(201).json({ conversation });
  } catch (err) {
    next(err);
  }
}

export async function getConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new NotFoundError('Unauthorized');
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id, deletedAt: null },
    });
    if (!conversation) throw new NotFoundError('Conversation not found');
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ conversation, messages });
  } catch (err) {
    next(err);
  }
}

export async function updateConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new NotFoundError('Unauthorized');
    const parsed = updateConversationSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw new ValidationError('Invalid update', parsed.error.flatten());
    const existing = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Conversation not found');
    const conversation = await prisma.conversation.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.modelPreference !== undefined ? { modelPreference: parsed.data.modelPreference } : {}),
      },
    });
    res.json({ conversation });
  } catch (err) {
    next(err);
  }
}

export async function deleteConversation(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new NotFoundError('Unauthorized');
    const existing = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError('Conversation not found');
    await prisma.conversation.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
