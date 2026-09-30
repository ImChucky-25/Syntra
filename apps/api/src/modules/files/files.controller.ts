import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { getStorage } from './storage.js';
import { extractText, sniffContent, MAX_FILE_BYTES } from './extract.js';
import type { FileStatus } from '@prisma/client';

const ALLOWED_TEXT_EXTS = new Set(['txt', 'md', 'csv', 'json']);

/** Extension allowlist applied after content sniffing (defense in depth). */
function extOk(ext: string, sniffedExt: string): boolean {
  if (sniffedExt === 'txt') return ALLOWED_TEXT_EXTS.has(ext);
  return ext === sniffedExt;
}

/** POST /api/v1/files — multipart upload, validate, store, extract. */
export async function uploadFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      throw new ValidationError('No file uploaded (expected multipart field "file")');
    }
    if (file.size > MAX_FILE_BYTES) {
      throw new ValidationError('File exceeds the 10 MB limit');
    }

    const sniffed = sniffContent(file.buffer);
    const originalExt = file.originalname.includes('.')
      ? file.originalname.split('.').pop()!.toLowerCase()
      : '';
    if (originalExt && !extOk(originalExt, sniffed.ext)) {
      throw new ValidationError(`File extension ".${originalExt}" does not match content or is not supported`);
    }

    const extraction = await extractText(file.buffer);

    const storageKey = await getStorage().put(file.buffer);
    const record = await prisma.file.create({
      data: {
        userId: user.id,
        filename: file.originalname.slice(0, 255) || `upload.${sniffed.ext}`,
        storageKey,
        mimeType: file.mimetype.slice(0, 100),
        sizeBytes: file.size,
        status: (extraction.text.trim() ? 'READY' : 'FAILED') as FileStatus,
        extractedText: extraction.text.trim() ? extraction.text : null,
        charCount: extraction.text.length,
        error: extraction.text.trim() ? null : 'No extractable text content',
      },
    });

    res.status(201).json({
      file: {
        id: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        status: record.status,
        charCount: record.charCount,
        createdAt: record.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/** GET /api/v1/files — list the user's files (metadata only). */
export async function listFiles(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const query = listQuerySchema.safeParse(req.query);
    if (!query.success) throw new ValidationError('Invalid pagination');

    const files = await prisma.file.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: query.data.limit,
      skip: query.data.offset,
      select: {
        id: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        status: true,
        charCount: true,
        createdAt: true,
      },
    });
    res.json({ files });
  } catch (err) {
    next(err);
  }
}

/** GET /api/v1/files/:id — metadata + extracted text (owner only). */
export async function getFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ValidationError('Invalid file id');

    const record = await prisma.file.findFirst({
      where: { id: id.data, userId: user.id },
    });
    if (!record) throw new NotFoundError('File not found');

    res.json({
      file: {
        id: record.id,
        filename: record.filename,
        mimeType: record.mimeType,
        sizeBytes: record.sizeBytes,
        status: record.status,
        charCount: record.charCount,
        error: record.error,
        extractedText: record.extractedText,
        createdAt: record.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** DELETE /api/v1/files/:id — removes storage object + row (owner only). */
export async function deleteFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: { code: 'unauthorized', message: 'Sign in required' } });
      return;
    }
    const id = z.string().uuid().safeParse(req.params.id);
    if (!id.success) throw new ValidationError('Invalid file id');

    const record = await prisma.file.findFirst({
      where: { id: id.data, userId: user.id },
    });
    if (!record) throw new NotFoundError('File not found');

    await getStorage().delete(record.storageKey);
    await prisma.file.delete({ where: { id: record.id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
