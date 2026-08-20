import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';
import { htmlToText } from '../html-to-text.js';
import type { Page } from '../types/canvas.js';

function renderBody(html: string | null | undefined, format: 'text' | 'html'): string {
  if (!html) return '';
  return format === 'html' ? html : htmlToText(html);
}

function isPagesIndexUnavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(404|403)\b/.test(message) || /has been disabled/i.test(message);
}

function formatPage(page: Page, format: 'text' | 'html') {
  return {
    page_id: page.page_id,
    url: page.url,
    title: page.title,
    published: page.published,
    front_page: page.front_page,
    updated_at: page.updated_at,
    html_url: page.html_url,
    locked_for_user: page.locked_for_user,
    lock_explanation: page.lock_explanation,
    body: renderBody(page.body, format),
  };
}

export function registerPageTools(server: McpServer) {
  const client = getCanvasClient();

  // List the wiki pages in a course
  server.tool(
    'list_pages',
    {
      course_id: z.number().describe('The Canvas course ID'),
      search_term: z.string().optional()
        .describe('Filter pages by title or body content'),
      sort: z.enum(['title', 'created_at', 'updated_at']).optional()
        .describe('Field to sort pages by'),
      order: z.enum(['asc', 'desc']).optional()
        .describe('Sort direction'),
      published_only: z.boolean().optional().default(true)
        .describe('Only return published pages'),
    },
    async ({ course_id, search_term, sort, order, published_only }) => {
      try {
        let pages;
        try {
          pages = await client.listPages(course_id, {
            search_term,
            sort,
            order,
            published: published_only ? true : undefined,
          });
        } catch (error) {
          // Many institutions hide the Pages index from students while leaving the
          // pages themselves readable. Fall back to the module listing, which
          // carries a page_url for every Page item.
          if (!isPagesIndexUnavailable(error)) throw error;

          const modules = await client.listModules(course_id, { include: ['items'] });
          const fromModules = modules.flatMap(mod =>
            (mod.items ?? [])
              .filter(item => item.type === 'Page' && item.page_url)
              .map(item => ({
                url: item.page_url as string,
                title: item.title,
                module: mod.name,
                html_url: item.html_url,
              }))
          );

          const term = search_term?.toLowerCase();
          const filtered = term
            ? fromModules.filter(p => p.title.toLowerCase().includes(term) || p.url.includes(term))
            : fromModules;

          return json({
            source: 'modules',
            note: 'The Pages index is disabled for this course, so this list was derived from module items and may omit pages not linked in a module. Fetch any entry with get_page using its url.',
            count: filtered.length,
            pages: filtered,
          });
        }

        // The list endpoint omits bodies; callers fetch those with get_page.
        const formattedPages = pages.map(page => ({
          page_id: page.page_id,
          url: page.url,
          title: page.title,
          published: page.published,
          front_page: page.front_page,
          updated_at: page.updated_at,
          html_url: page.html_url,
          locked_for_user: page.locked_for_user,
        }));

        return json({
          source: 'pages_index',
          count: formattedPages.length,
          pages: formattedPages,
        });
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing pages: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Read a single page, including its body
  server.tool(
    'get_page',
    {
      course_id: z.number().describe('The Canvas course ID'),
      page_url: z.string()
        .describe('The page url slug (e.g. "week-1-notes") or its numeric page ID, as returned by list_pages'),
      format: z.enum(['text', 'html']).optional().default('text')
        .describe('Return the body as readable plain text or as raw HTML'),
    },
    async ({ course_id, page_url, format }) => {
      try {
        const page = await client.getPage(course_id, page_url);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formatPage(page, format), null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting page: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Read whatever a course actually shows as its home page
  server.tool(
    'get_course_homepage',
    {
      course_id: z.number().describe('The Canvas course ID'),
      format: z.enum(['text', 'html']).optional().default('text')
        .describe('Return page/syllabus content as readable plain text or as raw HTML'),
    },
    async ({ course_id, format }) => {
      try {
        // A course home page is whichever view the teacher picked, so resolve
        // default_view rather than assuming there is a wiki front page.
        const course = await client.getCourse(course_id, ['syllabus_body']);
        const view = course.default_view;

        const base = {
          course_id: course.id,
          course_code: course.course_code,
          course_name: course.name,
          home_page_type: view,
        };

        if (view === 'wiki' || view === 'feed') {
          try {
            const page = await client.getFrontPage(course_id);
            return json({ ...base, front_page: formatPage(page, format) });
          } catch (error) {
            if (view === 'wiki') throw error;
            // 'feed' courses show recent activity, which has no page body.
            return json({
              ...base,
              note: 'This course shows the recent activity stream as its home page and has no front page set. Use list_announcements for recent activity.',
            });
          }
        }

        if (view === 'syllabus') {
          return json({
            ...base,
            syllabus: renderBody(course.syllabus_body, format),
          });
        }

        if (view === 'modules') {
          const modules = await client.listModules(course_id, {
            include: ['items', 'content_details'],
          });
          return json({
            ...base,
            modules: modules.map(mod => ({
              id: mod.id,
              name: mod.name,
              position: mod.position,
              state: mod.state,
              items_count: mod.items_count,
              items: mod.items?.map(item => ({
                id: item.id,
                title: item.title,
                type: item.type,
                content_id: item.content_id,
                // Present on Page items — pass to get_page to read the body.
                page_url: item.page_url,
                html_url: item.html_url,
              })),
            })),
          });
        }

        // view === 'assignments'
        const assignments = await client.listAssignments(course_id);
        return json({
          ...base,
          assignments: assignments.map(a => ({
            id: a.id,
            name: a.name,
            due_at: a.due_at,
            points_possible: a.points_possible,
            html_url: a.html_url,
          })),
        });
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting course homepage: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Read the syllabus body regardless of which home page view is set
  server.tool(
    'get_syllabus',
    {
      course_id: z.number().describe('The Canvas course ID'),
      format: z.enum(['text', 'html']).optional().default('text')
        .describe('Return the syllabus as readable plain text or as raw HTML'),
    },
    async ({ course_id, format }) => {
      try {
        const course = await client.getCourse(course_id, ['syllabus_body']);
        const syllabus = renderBody(course.syllabus_body, format);

        return json({
          course_id: course.id,
          course_code: course.course_code,
          course_name: course.name,
          has_syllabus: syllabus.length > 0,
          syllabus,
        });
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting syllabus: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}

function json(payload: unknown) {
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(payload, null, 2),
    }],
  };
}
