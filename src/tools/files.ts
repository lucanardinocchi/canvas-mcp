import { z } from 'zod';
import { createWriteStream } from 'node:fs';
import { rename, unlink, stat } from 'node:fs/promises';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';
import { extractFileLinks } from '../file-links.js';
import {
  ensureDir,
  formatBytes,
  getDownloadRoot,
  getMaxDownloadBytes,
  resolveTargetPath,
  sanitizeSegment,
  uniquePath,
} from '../downloads.js';
import {
  decodeTextual,
  extractPdfText,
  isImage,
  isPdf,
  isTextualType,
} from '../extract-text.js';
import type { CanvasFile } from '../types/canvas.js';

const MAX_METADATA_LOOKUPS = 60;

function json(payload: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function fail(action: string, error: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: `Error ${action}: ${error instanceof Error ? error.message : String(error)}`,
    }],
    isError: true,
  };
}

/** Public Canvas link for a file, without the signed verifier token. */
function canvasUrl(baseUrl: string, fileId: number, courseId?: number): string {
  return courseId
    ? `${baseUrl}/courses/${courseId}/files/${fileId}`
    : `${baseUrl}/files/${fileId}`;
}

function describeFile(file: CanvasFile, baseUrl: string, courseId?: number) {
  return {
    file_id: file.id,
    filename: file.display_name || file.filename,
    content_type: file['content-type'],
    size_bytes: file.size,
    size: formatBytes(file.size),
    updated_at: file.updated_at,
    locked_for_user: file.locked_for_user,
    lock_explanation: file.lock_explanation,
    canvas_url: canvasUrl(baseUrl, file.id, courseId),
  };
}

/** Fetch a page body (or the course front page when no slug is given). */
async function loadPageHtml(
  client: ReturnType<typeof getCanvasClient>,
  courseId: number,
  pageUrl?: string
): Promise<{ title: string; url: string; html: string }> {
  const page = pageUrl
    ? await client.getPage(courseId, pageUrl)
    : await client.getFrontPage(courseId);
  return { title: page.title, url: page.url, html: page.body ?? '' };
}

interface DownloadOutcome {
  file_id: number;
  filename: string;
  size: string;
  size_bytes: number;
  content_type: string;
  saved_to?: string;
  skipped?: string;
}

async function downloadOne(
  client: ReturnType<typeof getCanvasClient>,
  file: CanvasFile,
  opts: { subfolder?: string; saveAs?: string; overwrite: boolean }
): Promise<DownloadOutcome> {
  const maxBytes = getMaxDownloadBytes();
  const displayName = file.display_name || file.filename;
  const base: DownloadOutcome = {
    file_id: file.id,
    filename: displayName,
    size: formatBytes(file.size),
    size_bytes: file.size,
    content_type: file['content-type'],
  };

  if (file.size > maxBytes) {
    return {
      ...base,
      skipped: `File is ${formatBytes(file.size)}, above the ${formatBytes(maxBytes)} limit. Raise CANVAS_MAX_DOWNLOAD_MB to allow it.`,
    };
  }

  const root = getDownloadRoot();
  const filename = sanitizeSegment(opts.saveAs || displayName, `canvas-file-${file.id}`);
  let target = resolveTargetPath(root, opts.subfolder, filename);

  if (!opts.overwrite) {
    const existing = await stat(target).catch(() => null);
    if (existing?.isFile() && existing.size === file.size) {
      return { ...base, saved_to: target, skipped: 'Already downloaded (same size); left as is.' };
    }
    target = await uniquePath(target);
  }

  await ensureDir(path.dirname(target));

  const response = await client.openFileStream(file.url);

  // Trust neither the metadata nor content-length alone; stop mid-stream if the
  // body turns out to be larger than the cap.
  let received = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > maxBytes) {
        callback(new Error(`Download exceeded the ${formatBytes(maxBytes)} limit`));
        return;
      }
      callback(null, chunk);
    },
  });

  const partial = `${target}.part`;
  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      limiter,
      createWriteStream(partial)
    );
    await rename(partial, target);
  } catch (error) {
    await unlink(partial).catch(() => {});
    throw error;
  }

  return { ...base, size: formatBytes(received), size_bytes: received, saved_to: target };
}

/**
 * Claude's sandbox is a separate VM, so a file saved on the host is not
 * readable from there until it is staged in. Say so explicitly in the result.
 */
function stagingHint(paths: string[]): string {
  return (
    'These paths are on the local device, not inside Claude\'s sandbox. ' +
    'To work with the files there, stage them with device_stage_files using ' +
    'these exact paths; they then appear under /mnt/user-data/uploads/. ' +
    'If staging is unavailable, use read_file to get the contents inline instead. ' +
    `Paths: ${paths.join(', ')}`
  );
}

/** Read a Canvas file into memory, refusing anything past the size cap. */
async function fetchFileBytes(
  client: ReturnType<typeof getCanvasClient>,
  file: CanvasFile,
  maxBytes: number
): Promise<Uint8Array> {
  if (file.size > maxBytes) {
    throw new Error(
      `File is ${formatBytes(file.size)}, above the ${formatBytes(maxBytes)} limit. ` +
      'Raise CANVAS_MAX_DOWNLOAD_MB to allow it.'
    );
  }

  const response = await client.openFileStream(file.url);
  const chunks: Uint8Array[] = [];
  let received = 0;

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    received += chunk.length;
    if (received > maxBytes) {
      throw new Error(`Download exceeded the ${formatBytes(maxBytes)} limit`);
    }
    chunks.push(chunk);
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

export function registerFileTools(server: McpServer) {
  const client = getCanvasClient();

  // Discover the files linked from a page
  server.tool(
    'list_page_files',
    {
      course_id: z.number().describe('The Canvas course ID'),
      page_url: z.string().optional()
        .describe('Page url slug or numeric page ID. Omit to use the course front page.'),
    },
    async ({ course_id, page_url }) => {
      try {
        const page = await loadPageHtml(client, course_id, page_url);
        const links = extractFileLinks(page.html);

        if (links.length === 0) {
          return json({
            page: { title: page.title, url: page.url },
            count: 0,
            files: [],
            note: 'No file links found on this page.',
          });
        }

        const lookups = links.slice(0, MAX_METADATA_LOOKUPS);
        const files = await Promise.all(
          lookups.map(async link => {
            try {
              const file = await client.getFile(link.file_id, course_id);
              return { ...describeFile(file, client.getBaseUrl(), course_id), link_text: link.label };
            } catch (error) {
              // A linked file can be deleted or restricted while the link remains.
              return {
                file_id: link.file_id,
                link_text: link.label,
                error: error instanceof Error ? error.message : String(error),
              };
            }
          })
        );

        return json({
          page: { title: page.title, url: page.url },
          count: files.length,
          truncated: links.length > lookups.length
            ? `Showing ${lookups.length} of ${links.length} linked files.`
            : undefined,
          files,
        });
      } catch (error) {
        return fail('listing page files', error);
      }
    }
  );

  // Inspect a single file without downloading it
  server.tool(
    'get_file_info',
    {
      file_id: z.number().describe('The Canvas file ID'),
      course_id: z.number().optional()
        .describe('Course ID the file belongs to. Helps when global file access is restricted.'),
    },
    async ({ file_id, course_id }) => {
      try {
        const file = await client.getFile(file_id, course_id);
        return json(describeFile(file, client.getBaseUrl(), course_id));
      } catch (error) {
        return fail('getting file info', error);
      }
    }
  );

  // Download one file to disk
  server.tool(
    'download_file',
    {
      file_id: z.number().describe('The Canvas file ID, as returned by list_page_files'),
      course_id: z.number().optional()
        .describe('Course ID the file belongs to. Helps when global file access is restricted.'),
      subfolder: z.string().optional()
        .describe('Folder beneath the download directory to save into, e.g. "MATH1116"'),
      save_as: z.string().optional()
        .describe('Override the filename. Defaults to the name used in Canvas.'),
      overwrite: z.boolean().optional().default(false)
        .describe('Overwrite an existing file instead of saving alongside it'),
    },
    async ({ file_id, course_id, subfolder, save_as, overwrite }) => {
      try {
        const file = await client.getFile(file_id, course_id);
        const result = await downloadOne(client, file, { subfolder, saveAs: save_as, overwrite });
        return json({
          download_root: getDownloadRoot(),
          ...result,
          next_step: result.saved_to ? stagingHint([result.saved_to]) : undefined,
        });
      } catch (error) {
        return fail('downloading file', error);
      }
    }
  );

  // Download everything linked from a page — the "get me this week's notes" path
  server.tool(
    'download_page_files',
    {
      course_id: z.number().describe('The Canvas course ID'),
      page_url: z.string().optional()
        .describe('Page url slug or numeric page ID. Omit to use the course front page.'),
      subfolder: z.string().optional()
        .describe('Folder beneath the download directory. Defaults to the course code.'),
      extensions: z.array(z.string()).optional()
        .describe('Only download files with these extensions, e.g. ["pdf"]'),
      max_files: z.number().optional().default(20)
        .describe('Stop after this many files'),
      overwrite: z.boolean().optional().default(false)
        .describe('Overwrite existing files instead of saving alongside them'),
    },
    async ({ course_id, page_url, subfolder, extensions, max_files, overwrite }) => {
      try {
        const page = await loadPageHtml(client, course_id, page_url);
        const links = extractFileLinks(page.html);

        let folder = subfolder;
        if (!folder) {
          const course = await client.getCourse(course_id);
          folder = sanitizeSegment(course.course_code, `course-${course_id}`);
        }

        const wanted = extensions?.map(e => e.replace(/^\./, '').toLowerCase());
        const results: DownloadOutcome[] = [];
        let considered = 0;

        for (const link of links) {
          if (results.length >= max_files) break;

          let file: CanvasFile;
          try {
            file = await client.getFile(link.file_id, course_id);
          } catch (error) {
            results.push({
              file_id: link.file_id,
              filename: link.label ?? `file ${link.file_id}`,
              size: 'unknown',
              size_bytes: 0,
              content_type: 'unknown',
              skipped: error instanceof Error ? error.message : String(error),
            });
            continue;
          }

          considered++;
          const ext = path.extname(file.display_name || file.filename).replace(/^\./, '').toLowerCase();
          if (wanted && !wanted.includes(ext)) continue;

          try {
            results.push(await downloadOne(client, file, { subfolder: folder, overwrite }));
          } catch (error) {
            results.push({
              file_id: file.id,
              filename: file.display_name || file.filename,
              size: formatBytes(file.size),
              size_bytes: file.size,
              content_type: file['content-type'],
              skipped: error instanceof Error ? error.message : String(error),
            });
          }
        }

        const saved = results.filter(r => r.saved_to && !r.skipped);
        return json({
          page: { title: page.title, url: page.url },
          download_root: getDownloadRoot(),
          subfolder: folder,
          links_found: links.length,
          files_considered: considered,
          downloaded: saved.length,
          total_size: formatBytes(saved.reduce((sum, r) => sum + r.size_bytes, 0)),
          results,
          next_step: saved.length
            ? stagingHint(saved.map(r => r.saved_to as string))
            : undefined,
        });
      } catch (error) {
        return fail('downloading page files', error);
      }
    }
  );

  // Read a file's contents straight into the conversation. This is the route
  // that works regardless of sandbox mounts: the bytes travel through the MCP
  // result rather than the filesystem.
  server.tool(
    'read_file',
    {
      file_id: z.number().describe('The Canvas file ID, as returned by list_page_files'),
      course_id: z.number().optional()
        .describe('Course ID the file belongs to. Helps when global file access is restricted.'),
      page_range: z.string().optional()
        .describe('For PDFs, which pages to read, e.g. "1-10" or "2,5-7". Omit to read all.'),
      max_chars: z.number().optional().default(120000)
        .describe('Truncate the extracted text at this many characters'),
    },
    async ({ file_id, course_id, page_range, max_chars }) => {
      try {
        const file = await client.getFile(file_id, course_id);
        const filename = file.display_name || file.filename;
        const contentType = file['content-type'] ?? '';
        const bytes = await fetchFileBytes(client, file, getMaxDownloadBytes());

        const meta = {
          file_id: file.id,
          filename,
          content_type: contentType,
          size: formatBytes(file.size),
          canvas_url: canvasUrl(client.getBaseUrl(), file.id, course_id),
        };

        // Images go back as an image block so Claude can actually look at them.
        if (isImage(contentType)) {
          return {
            content: [
              { type: 'text' as const, text: JSON.stringify(meta, null, 2) },
              {
                type: 'image' as const,
                data: Buffer.from(bytes).toString('base64'),
                mimeType: contentType,
              },
            ],
          };
        }

        if (isPdf(contentType, filename)) {
          const extracted = await extractPdfText(bytes, {
            pageRange: page_range,
            maxChars: max_chars,
          });
          return {
            content: [{
              type: 'text' as const,
              text:
                JSON.stringify(
                  {
                    ...meta,
                    pages: extracted.pages,
                    pages_read: extracted.pages_read,
                    truncated: extracted.truncated || undefined,
                    note: extracted.truncated
                      ? `Output truncated at ${max_chars} characters. Use page_range to read the rest.`
                      : undefined,
                  },
                  null,
                  2
                ) +
                '\n\n' +
                extracted.text,
            }],
          };
        }

        if (isTextualType(contentType, filename)) {
          const decoded = decodeTextual(bytes, max_chars);
          return {
            content: [{
              type: 'text' as const,
              text:
                JSON.stringify({ ...meta, truncated: decoded.truncated || undefined }, null, 2) +
                '\n\n' +
                decoded.text,
            }],
          };
        }

        return json({
          ...meta,
          note:
            `This file type cannot be read as text. Use download_file to save it to the ` +
            `device, then stage it into the sandbox with device_stage_files.`,
        });
      } catch (error) {
        return fail('reading file', error);
      }
    }
  );

  // The course files index, where the institution leaves it enabled
  server.tool(
    'list_course_files',
    {
      course_id: z.number().describe('The Canvas course ID'),
      search_term: z.string().optional().describe('Filter files by name'),
    },
    async ({ course_id, search_term }) => {
      try {
        const files = await client.listCourseFiles(course_id, { search_term });
        return json({
          count: files.length,
          files: files.map(f => describeFile(f, client.getBaseUrl(), course_id)),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/\b(401|403|404)\b/.test(message)) {
          return json({
            count: 0,
            files: [],
            note: 'The course files index is not available to you for this course. Use list_page_files to find files linked from course pages instead.',
          });
        }
        return fail('listing course files', error);
      }
    }
  );
}
