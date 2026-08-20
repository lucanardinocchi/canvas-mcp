// Turning downloaded bytes into something a model can actually read.
// The MCP server runs on the host, outside Claude's sandbox, so returning
// content inline in the tool result is the only way the file reaches Claude.

import { extractText, getDocumentProxy } from 'unpdf';

export interface ExtractedText {
  text: string;
  pages?: number;
  pages_read?: string;
  truncated: boolean;
}

/** Parse "1-5", "3", "2,4-6" into a sorted list of 1-based page numbers. */
export function parsePageRange(spec: string | undefined, total: number): number[] | null {
  if (!spec || !spec.trim()) return null;

  const selected = new Set<number>();
  for (const raw of spec.split(',')) {
    const part = raw.trim();
    if (!part) continue;

    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Math.max(1, Number(range[1]));
      const to = Math.min(total, Number(range[2]));
      for (let page = from; page <= to; page++) selected.add(page);
      continue;
    }

    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page >= 1 && page <= total) selected.add(page);
      continue;
    }

    throw new Error(`Invalid page range segment: "${part}". Use forms like "1-5", "3", or "2,4-6".`);
  }

  return [...selected].sort((a, b) => a - b);
}

export async function extractPdfText(
  data: Uint8Array,
  options: { pageRange?: string; maxChars: number }
): Promise<ExtractedText> {
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const perPage: string[] = Array.isArray(text) ? text : [text];

  const wanted = parsePageRange(options.pageRange, totalPages);
  const pageNumbers = wanted ?? perPage.map((_, index) => index + 1);

  if (wanted && wanted.length === 0) {
    throw new Error(`Page range "${options.pageRange}" selects no pages; the document has ${totalPages}.`);
  }

  // Page markers keep citations honest when only part of a document is read.
  const chunks = pageNumbers.map(
    page => `--- page ${page} ---\n${(perPage[page - 1] ?? '').trim()}`
  );

  let body = chunks.join('\n\n').trim();
  let truncated = false;
  if (body.length > options.maxChars) {
    body = body.slice(0, options.maxChars);
    truncated = true;
  }

  return {
    text: body,
    pages: totalPages,
    pages_read: describeSelection(pageNumbers, totalPages),
    truncated,
  };
}

function describeSelection(pages: number[], total: number): string {
  if (pages.length === total) return `all ${total}`;
  if (pages.length === 0) return 'none';
  if (pages.length === 1) return String(pages[0]);
  return `${pages.length} of ${total} (${pages[0]}-${pages[pages.length - 1]})`;
}

const TEXTUAL_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
  'tex', 'bib', 'r', 'py', 'js', 'ts', 'java', 'c', 'cpp', 'h', 'sql',
  'html', 'htm', 'log', 'ipynb', 'm', 'jl',
]);

export function isTextualType(contentType: string, filename: string): boolean {
  const type = (contentType || '').toLowerCase();
  if (type.startsWith('text/')) return true;
  if (/^application\/(json|xml|javascript|x-tex|x-latex|rtf)/.test(type)) return true;

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return TEXTUAL_EXTENSIONS.has(ext);
}

export function isPdf(contentType: string, filename: string): boolean {
  return (
    (contentType || '').toLowerCase().includes('pdf') ||
    filename.toLowerCase().endsWith('.pdf')
  );
}

export function isImage(contentType: string): boolean {
  return /^image\/(png|jpe?g|gif|webp)$/i.test((contentType || '').trim());
}

export function decodeTextual(data: Uint8Array, maxChars: number): ExtractedText {
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(data);
  if (decoded.length > maxChars) {
    return { text: decoded.slice(0, maxChars), truncated: true };
  }
  return { text: decoded, truncated: false };
}
