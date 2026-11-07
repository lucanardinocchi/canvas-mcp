// Canvas embeds file references in page bodies as anchors carrying both a
// user-facing href and a data-api-endpoint. Both encode the numeric file id,
// which is all we need to fetch metadata or download the file.

import { decodeEntities } from './html-to-text.js';

export interface FileLink {
  file_id: number;
  /** Link text as it appears on the page, when the reference came from an anchor. */
  label?: string;
}

const FILE_ID_PATTERN = /\/files\/(\d+)/;
const FILE_ID_PATTERN_GLOBAL = /\/files\/(\d+)/g;
const ANCHOR_PATTERN = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

function attrValue(attrs: string, name: string): string {
  const match = attrs.match(
    new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
  );
  if (!match) return '';
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
}

/**
 * Pull every distinct Canvas file id out of an HTML body, preferring anchor
 * text as the label. Ids are returned in the order they appear on the page.
 */
export function extractFileLinks(html: string | null | undefined): FileLink[] {
  if (!html) return [];

  const found = new Map<number, FileLink>();

  // Anchors first, so labelled references win over bare ones.
  for (const match of html.matchAll(ANCHOR_PATTERN)) {
    const attrs = match[1] ?? '';
    const inner = match[2] ?? '';

    const candidate =
      attrValue(attrs, 'data-api-endpoint') || attrValue(attrs, 'href');
    const idMatch = candidate.match(FILE_ID_PATTERN);
    if (!idMatch) continue;

    const fileId = Number(idMatch[1]);
    if (!Number.isFinite(fileId) || found.has(fileId)) continue;

    const label =
      decodeEntities(inner.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() ||
      attrValue(attrs, 'title');

    found.set(fileId, label ? { file_id: fileId, label } : { file_id: fileId });
  }

  // Then anything referenced outside an anchor (img src, iframe src, raw urls).
  for (const match of html.matchAll(FILE_ID_PATTERN_GLOBAL)) {
    const fileId = Number(match[1]);
    if (!Number.isFinite(fileId) || found.has(fileId)) continue;
    found.set(fileId, { file_id: fileId });
  }

  return [...found.values()];
}
