import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

export function registerModuleTools(server: McpServer) {
  const client = getCanvasClient();

  // List modules for a course
  server.tool(
    'list_modules',
    {
      course_id: z.number().describe('The Canvas course ID'),
      include_items: z.boolean().optional().default(true)
        .describe('Include module items in the response'),
      search_term: z.string().optional()
        .describe('Search term to filter modules'),
    },
    async ({ course_id, include_items, search_term }) => {
      try {
        const include: ('items' | 'content_details')[] = [];
        if (include_items) {
          include.push('items', 'content_details');
        }

        const modules = await client.listModules(course_id, {
          include,
          search_term,
        });

        const formattedModules = modules.map(mod => ({
          id: mod.id,
          name: mod.name,
          position: mod.position,
          unlock_at: mod.unlock_at,
          state: mod.state,
          completed_at: mod.completed_at,
          items_count: mod.items_count,
          require_sequential_progress: mod.require_sequential_progress,
          items: include_items && mod.items ? mod.items.map(item => ({
            id: item.id,
            title: item.title,
            type: item.type,
            position: item.position,
            html_url: item.html_url,
            content_id: item.content_id,
            // Present on Page items — pass to get_page to read the body.
            page_url: item.page_url,
            completion_requirement: item.completion_requirement,
            content_details: item.content_details,
          })) : undefined,
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedModules, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing modules: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // List announcements for courses
  server.tool(
    'list_announcements',
    {
      course_ids: z.array(z.number()).describe('Array of course IDs to fetch announcements from'),
      start_date: z.string().optional()
        .describe('Only return announcements posted after this date (ISO 8601 format)'),
      end_date: z.string().optional()
        .describe('Only return announcements posted before this date (ISO 8601 format)'),
      active_only: z.boolean().optional().default(true)
        .describe('Only return active announcements'),
    },
    async ({ course_ids, start_date, end_date, active_only }) => {
      try {
        const contextCodes = course_ids.map(id => `course_${id}`);

        const announcements = await client.listAnnouncements({
          context_codes: contextCodes,
          start_date,
          end_date,
          active_only,
        });

        const formattedAnnouncements = announcements.map(ann => ({
          id: ann.id,
          title: ann.title,
          message: ann.message,
          posted_at: ann.posted_at,
          author: ann.user_name,
          context_code: ann.context_code,
          html_url: ann.html_url,
          read_state: ann.read_state,
          attachments: ann.attachments?.map(att => ({
            filename: att.filename,
            url: att.url,
          })),
        }));

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(formattedAnnouncements, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error listing announcements: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
