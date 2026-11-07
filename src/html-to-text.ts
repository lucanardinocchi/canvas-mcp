// Canvas page/syllabus bodies come back as HTML. These helpers flatten that into
// readable plain text while keeping the things that matter in course material:
// links to files, embedded media, and list/heading structure.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  bull: '•',
  middot: '·',
  deg: '°',
  times: '×',
  divide: '÷',
  plusmn: '±',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';

  let text = html;

  // Drop content that is never useful as prose.
  text = text.replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Keep media references — Canvas pages lean heavily on embedded video and images.
  text = text.replace(/<img\b[^>]*>/gi, tag => {
    const alt = attr(tag, 'alt');
    const src = attr(tag, 'src');
    const label = alt || 'image';
    return src ? `[image: ${label} — ${src}]` : `[image: ${label}]`;
  });
  text = text.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>|<iframe\b[^>]*>/gi, tag => {
    const src = attr(tag, 'src');
    const title = attr(tag, 'title');
    return src ? `[embedded: ${title || 'media'} — ${src}]` : '[embedded media]';
  });

  // Links: "text (url)", but skip the url when it just repeats the text.
  text = text.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (_match, attrs: string, inner: string) => {
      const href = attr(`<a ${attrs}>`, 'href');
      const label = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
      if (!href) return label;
      if (!label) return href;
      if (label.replace(/\s+/g, '') === href.replace(/\s+/g, '')) return label;
      return `${label} (${href})`;
    }
  );

  // Structure.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(h[1-6])>/gi, '\n\n');
  text = text.replace(/<h[1-6]\b[^>]*>/gi, '\n\n# ');
  text = text.replace(/<li\b[^>]*>/gi, '\n- ');
  text = text.replace(/<\/li>/gi, '');
  text = text.replace(/<\/(p|div|ul|ol|section|article|blockquote|pre|table)>/gi, '\n\n');
  text = text.replace(/<\/(tr|thead|tbody)>/gi, '\n');
  text = text.replace(/<(td|th)\b[^>]*>/gi, ' | ');
  text = text.replace(/<hr\s*\/?>/gi, '\n---\n');

  // Anything left over is markup we do not need.
  text = text.replace(/<[^>]+>/g, '');
  text = decodeEntities(text);

  // Tidy whitespace without destroying paragraph breaks.
  text = text.replace(/\r\n?/g, '\n');
  text = text
    .split('\n')
    .map(line => line.replace(/[ \t ]+/g, ' ').trimEnd())
    .join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');

  return text.trim();
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  if (!match) return '';
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
}
