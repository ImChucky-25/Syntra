import { ProviderError } from '../../lib/errors.js';

/**
 * Document extraction (spec §4.4): converts uploaded files into plain text for
 * the Document Agent / analyze endpoint. Content is identified by magic bytes,
 * never by client-supplied filename or mime type (spec §11.2 untrusted input).
 */

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_BYTES = 2 * 1024 * 1024; // 2 MB for plain-text formats
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB for PDFs

export interface SniffResult {
  kind: 'pdf' | 'docx' | 'text';
  ext: string;
}

/** Content sniffing via magic bytes; text is a fallback, not an allowlist hit. */
export function sniffContent(buf: Buffer): SniffResult {
  if (buf.length >= 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') {
    return { kind: 'pdf', ext: 'pdf' };
  }
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x0403_4b50) {
    return { kind: 'docx', ext: 'docx' };
  }
  return { kind: 'text', ext: 'txt' };
}

export interface ExtractResult {
  text: string;
  kind: SniffResult['kind'];
}

/** Extract plain text from file bytes. Throws ProviderError(kind=invalid_request) for unsupported/oversized files. */
export async function extractText(buf: Buffer): Promise<ExtractResult> {
  if (buf.length === 0) throw new ProviderError('files', 'invalid_request', 'File is empty', 400);
  const { kind } = sniffContent(buf);

  if (kind === 'pdf') {
    if (buf.length > MAX_PDF_BYTES) {
      throw new ProviderError('files', 'invalid_request', 'PDF exceeds the 20 MB limit', 413);
    }
    // pdf-parse v2 class API; destroy() releases the worker buffers.
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(buf) });
    try {
      const result = await parser.getText();
      return { text: result.text, kind };
    } finally {
      await parser.destroy();
    }
  }

  if (kind === 'docx') {
    if (buf.length > MAX_FILE_BYTES) {
      throw new ProviderError('files', 'invalid_request', 'DOCX exceeds the 10 MB limit', 413);
    }
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ buffer: buf });
    return { text: value, kind };
  }

  if (buf.length > MAX_TEXT_BYTES) {
    throw new ProviderError('files', 'invalid_request', 'Text file exceeds the 2 MB limit', 413);
  }
  // UTF-8 lossy decode: valid UTF-8/ASCII passes; binary junk loses bytes but
  // cannot execute. Control chars other than tab/newline/CR are stripped.
  const text = buf.toString('utf8').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  return { text, kind };
}
