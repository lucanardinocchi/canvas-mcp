# Canvas LMS MCP Server for Claude

An MCP (Model Context Protocol) server that connects Claude to Canvas LMS, letting you manage your coursework through natural conversation.

**Ask Claude things like:**
- "What assignments do I have due this week?"
- "Show me the rubric for my essay assignment"
- "What did my professor say in the feedback?"
- "What subjects am I enrolled in this semester?"
- "List all my courses"
- "Are there any overdue assignments?"

## Quick Start

### 1. Get Your Canvas API Token

1. Log in to Canvas
2. Click your **profile picture** → **Settings**
3. Scroll to **Approved Integrations**
4. Click **+ New Access Token**
5. Name it (e.g., "Claude") and click **Generate Token**
6. **Copy the token** - you won't see it again!

### 2. Install the MCP Server

```bash
# Clone this repository
git clone https://github.com/lucanardinocchi/canvas-mcp.git
cd canvas-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### 3. Configure Claude Desktop

Open Claude Desktop's config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add (or merge) this configuration:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/FULL/PATH/TO/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_API_TOKEN": "YOUR_TOKEN_HERE",
        "CANVAS_BASE_URL": "https://your-school.instructure.com"
      }
    }
  }
}
```

**Replace:**
- `/FULL/PATH/TO/canvas-mcp` with the actual path where you cloned this repo
- `YOUR_TOKEN_HERE` with your Canvas API token
- `https://your-school.instructure.com` with your Canvas URL

**Common Canvas URLs:**
| University | Canvas URL |
|------------|------------|
| University of Sydney | `https://canvas.sydney.edu.au` |
| Generic Instructure | `https://canvas.instructure.com` |
| Your school | Check your browser when logged into Canvas |

### 4. Restart Claude Desktop

Quit Claude Desktop completely (Cmd+Q / Alt+F4) and reopen it.

You should now see Canvas tools available in Claude!

---

## What Can It Do?

### 📚 Courses
- List the subjects you're enrolled in (with term and current grade)
- List all your enrolled courses
- Get course details and syllabi

### 📝 Assignments
- List assignments (filter by upcoming, overdue, etc.)
- View full assignment details and instructions
- See rubrics and grading criteria
- Check your grades and submission status

### 💬 Discussions
- View discussion boards
- Post new discussion entries
- Reply to classmates

### 📤 Submissions
- Submit text assignments directly
- Upload files for submission
- View instructor feedback and comments

### 🔍 Search
- Find assignments by due date
- Search course content
- Get all upcoming work across all courses

---

## All Available Tools

| Tool | What it does |
|------|--------------|
| `list_my_subjects` | List the subjects you're enrolled in (term + current grade) |
| `list_courses` | List your enrolled courses |
| `get_course` | Get details about a specific course |
| `list_assignments` | List assignments (with filters) |
| `get_assignment` | Get full assignment details + rubric |
| `get_rubric` | Get grading rubric for an assignment |
| `get_submission` | View your submission and feedback |
| `submit_assignment` | Submit text or URL to an assignment |
| `upload_file` | Upload a file for submission |
| `list_modules` | Browse course modules |
| `list_announcements` | Get course announcements |
| `list_discussions` | View discussion topics |
| `get_discussion_entries` | Read discussion posts |
| `post_discussion_entry` | Post to a discussion |
| `reply_to_discussion` | Reply to a discussion post |
| `find_assignments_by_due_date` | Find assignments in a date range |
| `get_upcoming_assignments` | Get work due in the next N days |
| `get_overdue_assignments` | Find past-due work |
| `search_course_content` | Search modules and assignments |
| `get_all_upcoming_work` | Upcoming work across ALL courses |

---

## Troubleshooting

### "Canvas tools not showing up"
1. Make sure you restarted Claude Desktop completely
2. Check that the path in your config is correct
3. Verify your `claude_desktop_config.json` is valid JSON

### "401 Unauthorized" errors
Your API token is invalid or expired. Generate a new one in Canvas settings.

### "403 Forbidden" errors
You don't have access to that resource. The course may have ended, or you're not enrolled.

### "Connection refused" or network errors
Check that your `CANVAS_BASE_URL` is correct (no trailing slash).

---

## Security Notes

⚠️ **Keep your API token secret!**
- Never commit your token to git
- Don't share your token with others
- Set an expiration date when creating tokens
- Revoke tokens you no longer use (Canvas Settings → Approved Integrations)

Your API token has the same access as your Canvas account - anyone with it can view your grades, submit assignments, etc.

**The server protects your token:**
- `CANVAS_BASE_URL` must be `https://` (an `http://` URL is rejected so the token is never sent in cleartext, except for `localhost`).
- When paginating, the server only follows `next` links that point back to your configured Canvas host, so a crafted API response can't redirect your token to another server.

---

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev
```

### Project Structure
```
canvas-mcp/
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── canvas-client.ts   # Canvas API wrapper
│   ├── tools/             # Tool implementations
│   │   ├── courses.ts
│   │   ├── assignments.ts
│   │   ├── submissions.ts
│   │   ├── discussions.ts
│   │   ├── modules.ts
│   │   └── search.ts
│   └── types/
│       └── canvas.ts      # TypeScript types
├── dist/                  # Compiled output
├── package.json
└── tsconfig.json
```

---

## Contributing

Contributions welcome! Feel free to:
- Report bugs
- Suggest new features
- Submit pull requests

---

## License

MIT - Use it however you want!

---

## Acknowledgments

Built with:
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Canvas LMS REST API](https://canvas.instructure.com/doc/api/)
