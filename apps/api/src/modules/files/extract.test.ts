import { describe, expect, it } from 'vitest';
import { sniffContent, extractText } from './extract.js';

describe('sniffContent', () => {
  it('identifies PDFs by magic bytes regardless of filename', () => {
    const buf = Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(16)]);
    expect(sniffContent(buf)).toEqual({ kind: 'pdf', ext: 'pdf' });
  });

  it('identifies ZIP-based containers (DOCX) by magic bytes', () => {
    const buf = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(16)]);
    expect(sniffContent(buf)).toEqual({ kind: 'docx', ext: 'docx' });
  });

  it('falls back to text for anything else', () => {
    expect(sniffContent(Buffer.from('hello world'))).toEqual({ kind: 'text', ext: 'txt' });
  });
});

describe('extractText', () => {
  it('decodes plain UTF-8 text', async () => {
    const res = await extractText(Buffer.from('Hello — world'));
    expect(res.kind).toBe('text');
    expect(res.text).toBe('Hello — world');
  });

  it('strips dangerous control characters from text', async () => {
    const res = await extractText(Buffer.from('a\u0000b\u0007c\td'));
    expect(res.text).toBe('abc\td');
  });

  it('rejects empty files', async () => {
    await expect(extractText(Buffer.alloc(0))).rejects.toThrowError(/empty/i);
  });

  it('rejects oversized text files', async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 0x61);
    await expect(extractText(big)).rejects.toThrowError(/2 MB/);
  });

  it('extracts text from a real PDF buffer', async () => {
    // pdf-parse needs a parsable PDF; a minimal one-page document.
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n0\n%%EOF',
      'latin1',
    );
    const res = await extractText(pdf);
    expect(res.kind).toBe('pdf');
    expect(typeof res.text).toBe('string');
  });
});
