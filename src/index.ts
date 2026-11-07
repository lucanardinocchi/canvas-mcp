#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import dotenv from 'dotenv';

// Load environment variables from .env file if present
dotenv.config();

// Import tool registration functions
import { registerCourseTools } from './tools/courses.js';
import { registerAssignmentTools } from './tools/assignments.js';
import { registerSubmissionTools } from './tools/submissions.js';
import { registerModuleTools } from './tools/modules.js';
import { registerDiscussionTools } from './tools/discussions.js';
import { registerSearchTools } from './tools/search.js';
import { registerPageTools } from './tools/pages.js';
import { registerFileTools } from './tools/files.js';

// Validate required environment variables
function validateEnvironment(): void {
  const requiredVars = ['CANVAS_API_TOKEN', 'CANVAS_BASE_URL'];
  const missing = requiredVars.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error(`Error: Missing required environment variables: ${missing.join(', ')}`);
    console.error('Please set these variables in your environment or .env file.');
    console.error('');
    console.error('To get your Canvas API token:');
    console.error('1. Log in to Canvas');
    console.error('2. Go to Account > Settings');
    console.error('3. Scroll to "Approved Integrations"');
    console.error('4. Click "+ New Access Token"');
    console.error('');
    console.error('CANVAS_BASE_URL should be your Canvas instance URL, e.g.:');
    console.error('https://yourschool.instructure.com');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  // Validate environment before starting
  validateEnvironment();

  // Create the MCP server
  const server = new McpServer({
    name: 'canvas-lms',
    version: '1.0.0',
  });

  // Register all tools
  registerCourseTools(server);
  registerAssignmentTools(server);
  registerSubmissionTools(server);
  registerModuleTools(server);
  registerDiscussionTools(server);
  registerSearchTools(server);
  registerPageTools(server);
  registerFileTools(server);

  // Create stdio transport and connect
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log startup (to stderr to not interfere with MCP protocol on stdout)
  console.error('Canvas LMS MCP Server started successfully');
  console.error(`Connected to: ${process.env.CANVAS_BASE_URL}`);
}

// Run the server
main().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
