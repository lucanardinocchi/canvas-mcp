# Canvas LMS MCP Server for Claude

An MCP (Model Context Protocol) server that connects Claude to Canvas LMS, letting you manage your coursework through natural conversation.

**Ask Claude things like:**
- "What assignments do I have due this week?"
- "Show me the rubric for my essay assignment"
- "What did my professor say in the feedback?"
- "List all my courses"
- "Are there any overdue assignments?"

## Quick Start

**Requirements:** [Node.js](https://nodejs.org) 18 or newer, and Claude Desktop.

### macOS / Linux — one command

```bash
git clone <REPO_URL> canvas-mcp
cd canvas-mcp
./setup.sh
```

`setup.sh` installs dependencies, builds the server, then asks you for:

1. **Your Canvas URL** — whatever you see in the browser bar when logged in
   (e.g. `https://canvas.anu.edu.au`). A bare hostname is fine.
2. **Your Canvas API token** — in Canvas go to **Account -> Settings ->
   Approved Integrations -> + New Access Token**. Copy it immediately; Canvas
   shows it only once. Typing is hidden.
3. **Where downloaded files should go** — press Enter for `~/Downloads/canvas`.

It checks the token against Canvas before saving anything and tells you which
account it signed in as. Then quit Claude Desktop **completely** (Cmd+Q — closing
the window is not enough), reopen, and ask *"list my courses"*.

### Windows

```bash
git clone <REPO_URL> canvas-mcp
cd canvas-mcp
npm install --ignore-scripts
npm run build
npm run setup
```

### Notes

- The setup script **merges** into your Claude Desktop config — any MCP servers
  you already have are left alone — and writes a `.backup` copy first.
- Re-run `npm run setup` any time to change your token, Canvas URL, or download
  folder.
- If your institution has disabled student API tokens, there will be no
  **+ New Access Token** button. That is a policy setting; only your IT service
  desk can change it.

<details>
<summary>Manual configuration (if you would rather not run the script)</summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS,
`%APPDATA%\Claude\claude_desktop_config.json` on Windows, or
`~/.config/Claude/claude_desktop_config.json` on Linux:

```json
{
  "mcpServers": {
    "canvas": {
      "command": "node",
      "args": ["/FULL/PATH/TO/canvas-mcp/dist/index.js"],
      "env": {
        "CANVAS_API_TOKEN": "your_token_here",
        "CANVAS_BASE_URL": "https://canvas.yourschool.edu",
        "CANVAS_DOWNLOAD_DIR": "/Users/you/Downloads/canvas"
      }
    }
  }
}
```

Use the absolute path to `dist/index.js`, and no trailing slash on the URL.
</details>

### Optional environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CANVAS_DOWNLOAD_DIR` | `~/Downloads/canvas` | Where `download_file` saves files |
| `CANVAS_MAX_DOWNLOAD_MB` | `250` | Per-file download size cap |

---

## What Can It Do?

### 📚 Courses
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

### 📄 Pages
- Read a course home page, whatever view it uses
- Read any course page by name
- Read the syllabus

### 📎 Files
- Find the files linked on a page (lecture notes, slides, past papers)
- Read a PDF's text straight into the conversation, a page range at a time
- Download files to your computer

### 🔍 Search
- Find assignments by due date
- Search course content
- Get all upcoming work across all courses

---

## All Available Tools

| Tool | What it does |
|------|--------------|
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
| `get_course_homepage` | Read the course home page (any view type) |
| `get_page` | Read a course page by url slug |
| `list_pages` | List a course's pages |
| `get_syllabus` | Read the syllabus |
| `list_page_files` | List files linked on a page |
| `read_file` | Read a file's contents inline (PDF text, text, images) |
| `download_file` | Download one file to your computer |
| `download_page_files` | Download every file linked on a page |
| `get_file_info` | File metadata without downloading |
| `list_course_files` | Course files index, where enabled |

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

### "That page has been disabled for this course"
Some institutions hide the Pages and Files indexes from students. `list_pages`
and `list_page_files` fall back to reading the module listing, so they keep
working; `list_course_files` will report that the index is unavailable.

### Claude says it cannot open the files it downloaded
Downloads land on your computer, which is outside Claude's sandbox. Either ask
Claude to `read_file` (contents come back inline, no download needed), or ask it
to stage the downloaded paths into the sandbox.

---

## Security Notes

⚠️ **Keep your API token secret!**
- Never commit your token to git
- Don't share your token with others
- Set an expiration date when creating tokens
- Revoke tokens you no longer use (Canvas Settings → Approved Integrations)

Your API token has the same access as your Canvas account - anyone with it can view your grades, submit assignments, etc.

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
├── setup.sh               # One-command install
├── scripts/
│   └── configure.mjs      # Interactive Claude Desktop setup
├── src/
│   ├── index.ts           # MCP server entry point
│   ├── canvas-client.ts   # Canvas API wrapper
│   ├── downloads.ts       # Download paths, size caps, safety guards
│   ├── extract-text.ts    # PDF/text extraction for read_file
│   ├── file-links.ts      # Finds file links in page HTML
│   ├── html-to-text.ts    # Turns page HTML into readable text
│   ├── tools/             # Tool implementations
│   │   ├── courses.ts
│   │   ├── assignments.ts
│   │   ├── submissions.ts
│   │   ├── discussions.ts
│   │   ├── modules.ts
│   │   ├── pages.ts
│   │   ├── files.ts
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
