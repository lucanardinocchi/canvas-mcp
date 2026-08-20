// Filesystem side of downloading Canvas files. Everything lands under a single
// configurable root so a malicious or malformed filename cannot write elsewhere.

import { mkdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

const DEFAULT_MAX_DOWNLOAD_MB = 250;

export function expandHome(target: string): string {
  if (target === '~') return homedir();
  if (target.startsWith('~/')) return path.join(homedir(), target.slice(2));
  return target;
}

/** Root directory all downloads are confined to. */
export function getDownloadRoot(): string {
  const configured = process.env.CANVAS_DOWNLOAD_DIR?.trim();
  if (configured) return path.resolve(expandHome(configured));
  return path.join(homedir(), 'Downloads', 'canvas');
}

export function getMaxDownloadBytes(): number {
  const raw = process.env.CANVAS_MAX_DOWNLOAD_MB?.trim();
  const mb = raw ? Number(raw) : DEFAULT_MAX_DOWNLOAD_MB;
  if (!Number.isFinite(mb) || mb <= 0) return DEFAULT_MAX_DOWNLOAD_MB * 1024 * 1024;
  return Math.floor(mb * 1024 * 1024);
}

/**
 * Reduce an arbitrary Canvas-supplied name to a single safe path segment.
 * Strips directory separators, control characters, and leading dots.
 */
export function sanitizeSegment(name: string | undefined, fallback: string): string {
  const decoded = (name ?? '').replace(/[\u0000-\u001F\u007F]/g, '');
  const base = path
    .basename(decoded)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\.+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Windows-reserved names are harmless on macOS but cheap to avoid.
  if (!base || /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) return fallback;
  return base.slice(0, 180);
}

/** Sanitize each component of a user-supplied subfolder path. */
export function sanitizeSubfolder(subfolder: string | undefined): string {
  if (!subfolder) return '';
  return subfolder
    .split(/[\\/]+/)
    .map(segment => sanitizeSegment(segment, ''))
    .filter(Boolean)
    .join(path.sep);
}

/**
 * Resolve a destination inside the download root, refusing anything that
 * escapes it even after normalisation.
 */
export function resolveTargetPath(
  root: string,
  subfolder: string | undefined,
  filename: string
): string {
  const safeRoot = path.resolve(root);
  const target = path.resolve(
    safeRoot,
    sanitizeSubfolder(subfolder),
    sanitizeSegment(filename, 'canvas-file')
  );

  if (target !== safeRoot && !target.startsWith(safeRoot + path.sep)) {
    throw new Error(`Refusing to write outside the download directory (${safeRoot})`);
  }
  return target;
}

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function pathExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/** Append " (2)", " (3)" ... before the extension until the path is free. */
export async function uniquePath(target: string): Promise<string> {
  if (!(await pathExists(target))) return target;

  const dir = path.dirname(target);
  const ext = path.extname(target);
  const stem = path.basename(target, ext);

  for (let n = 2; n < 1000; n++) {
    const candidate = path.join(dir, `${stem} (${n})${ext}`);
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error(`Could not find a free filename for ${target}`);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}
