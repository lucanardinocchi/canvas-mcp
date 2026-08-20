import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getCanvasClient } from '../canvas-client.js';

export function registerSubmissionTools(server: McpServer) {
  const client = getCanvasClient();

  // Get submission details including feedback
  server.tool(
    'get_submission',
    {
      course_id: z.number().describe('The Canvas course ID'),
      assignment_id: z.number().describe('The assignment ID'),
      include_comments: z.boolean().optional().default(true)
        .describe('Include submission comments/feedback'),
    },
    async ({ course_id, assignment_id, include_comments }) => {
      try {
        const include = ['submission_comments', 'rubric_assessment'];
        
        const submission = await client.getSubmission(
          course_id,
          assignment_id,
          'self',
          include
        );

        const result: Record<string, unknown> = {
          id: submission.id,
          assignment_id: submission.assignment_id,
          user_id: submission.user_id,
          submitted_at: submission.submitted_at,
          attempt: submission.attempt,
          workflow_state: submission.workflow_state,
          grade: submission.grade,
          score: submission.score,
          graded_at: submission.graded_at,
          late: submission.late,
          missing: submission.missing,
          excused: submission.excused,
          points_deducted: submission.points_deducted,
          submission_type: submission.submission_type,
          body: submission.body,
          url: submission.url,
          preview_url: submission.preview_url,
        };

        if (submission.attachments && submission.attachments.length > 0) {
          result.attachments = submission.attachments.map(att => ({
            id: att.id,
            filename: att.filename,
            display_name: att.display_name,
            url: att.url,
            size: att.size,
            content_type: att.content_type,
          }));
        }

        if (include_comments && submission.submission_comments) {
          result.comments = submission.submission_comments.map(comment => ({
            id: comment.id,
            author_name: comment.author_name,
            comment: comment.comment,
            created_at: comment.created_at,
          }));
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error getting submission: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Submit an assignment (text entry)
  server.tool(
    'submit_assignment',
    {
      course_id: z.number().describe('The Canvas course ID'),
      assignment_id: z.number().describe('The assignment ID'),
      submission_type: z.enum(['online_text_entry', 'online_url']).describe('Type of submission'),
      body: z.string().optional().describe('Text content for online_text_entry submissions (supports HTML)'),
      url: z.string().optional().describe('URL for online_url submissions'),
    },
    async ({ course_id, assignment_id, submission_type, body, url }) => {
      try {
        // Validate required fields based on submission type
        if (submission_type === 'online_text_entry' && !body) {
          return {
            content: [{
              type: 'text',
              text: 'Error: body is required for online_text_entry submissions',
            }],
            isError: true,
          };
        }

        if (submission_type === 'online_url' && !url) {
          return {
            content: [{
              type: 'text',
              text: 'Error: url is required for online_url submissions',
            }],
            isError: true,
          };
        }

        const submission = await client.submitAssignment(course_id, assignment_id, {
          submission_type,
          body,
          url,
        });

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'Assignment submitted successfully',
              submission: {
                id: submission.id,
                submitted_at: submission.submitted_at,
                attempt: submission.attempt,
                workflow_state: submission.workflow_state,
              },
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error submitting assignment: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );

  // Upload a file for assignment submission
  server.tool(
    'upload_file',
    {
      course_id: z.number().describe('The Canvas course ID'),
      assignment_id: z.number().describe('The assignment ID'),
      file_name: z.string().describe('Name of the file to upload'),
      file_content: z.string().describe('Base64 encoded file content'),
      content_type: z.string().describe('MIME type of the file (e.g., application/pdf, text/plain)'),
      submit_after_upload: z.boolean().optional().default(false)
        .describe('Automatically submit the assignment after uploading'),
    },
    async ({ course_id, assignment_id, file_name, file_content, content_type, submit_after_upload }) => {
      try {
        // Decode base64 content
        const binaryString = atob(file_content);
        const fileBuffer = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          fileBuffer[i] = binaryString.charCodeAt(i);
        }
        const fileSize = fileBuffer.length;

        // Step 1: Initiate file upload
        const uploadInfo = await client.initiateFileUpload(
          course_id,
          assignment_id,
          file_name,
          fileSize,
          content_type
        );

        // Step 2: Upload the file
        const uploadResult = await client.uploadFileToUrl(
          uploadInfo.upload_url,
          uploadInfo.upload_params,
          fileBuffer,
          file_name,
          content_type
        );

        // Step 3: Optionally submit the assignment with the uploaded file
        if (submit_after_upload) {
          const submission = await client.submitAssignment(course_id, assignment_id, {
            submission_type: 'online_upload',
            file_ids: [uploadResult.id],
          });

          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'File uploaded and assignment submitted successfully',
                file: {
                  id: uploadResult.id,
                  name: file_name,
                },
                submission: {
                  id: submission.id,
                  submitted_at: submission.submitted_at,
                  attempt: submission.attempt,
                },
              }, null, 2),
            }],
          };
        }

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: true,
              message: 'File uploaded successfully (not submitted yet)',
              file: {
                id: uploadResult.id,
                name: file_name,
              },
              note: 'Use submit_assignment with file_ids to submit this file',
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: 'text',
            text: `Error uploading file: ${error instanceof Error ? error.message : String(error)}`,
          }],
          isError: true,
        };
      }
    }
  );
}
