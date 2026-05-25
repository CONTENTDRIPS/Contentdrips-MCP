# ContentDrips MCP Server

A Model Context Protocol (MCP) server that lets AI assistants (Claude, Cursor, etc.) generate carousels and graphics, manage posts, and publish to LinkedIn and Instagram directly via ContentDrips.

**Production URL:** `https://mcp.contentdrips.com`

---

## Getting Your Personal MCP URL

1. Log in to [ContentDrips](https://contentdrips.com)
2. Go to **Dashboard → API Settings**
3. Create a new API token and copy it
4. Your personal MCP URL is:

```
https://mcp.contentdrips.com/mcp/YOUR_API_KEY
```

The API key is embedded in the URL — you set it once and never need to enter it again.

---

## Adding to Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "contentdrips": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://mcp.contentdrips.com/mcp/YOUR_API_KEY"
      ]
    }
  }
}
```

Restart Claude Desktop after saving.

---

## Adding to Cursor

Go to **Cursor Settings → MCP → Add Server**:

- **Name:** ContentDrips
- **Type:** SSE
- **URL:** `https://mcp.contentdrips.com/mcp/YOUR_API_KEY`

---

## Adding to Claude.ai (Web)

1. Go to **Settings → Integrations → Add Integration**
2. Enter: `https://mcp.contentdrips.com`
3. Claude will open a ContentDrips authorization page — paste your API key and click **Connect**

---

## Available Tools

### Template Tools

| Tool | What it does |
|------|-------------|
| `search_templates` | Search public templates — returns thumbnail previews, ID, type, size, and last-edited date |
| `get_my_templates` | List your saved templates — same rich view with thumbnails |
| `get_template_structure` | Inspect a template's editable fields and labels |

### Generation Tools

| Tool | What it does |
|------|-------------|
| `generate_ai_carousel` | Generate a carousel using AI from a topic, blog, YouTube, or TikTok/Reel URL |
| `generate_ai_graphic` | Generate a non-carousel graphic using AI (same input methods) |
| `generate_carousel` | Generate a carousel from a custom JSON structure |
| `generate_graphic` | Generate a graphic from a custom `content_update` array |
| `check_job_status` | Get the final `export_url` once rendering is complete |

### Profile & Social Account Tools

| Tool | What it does |
|------|-------------|
| `get_profiles` | Get your ContentDrips profiles and default profile_id |
| `get_social_accounts` | Get connected LinkedIn/Instagram accounts for a profile |

### Post Management Tools

| Tool | What it does |
|------|-------------|
| `list_posts` | List posts by status (draft, scheduled, published) |
| `get_post` | Get details of a specific post |
| `create_post` | Create a new draft post with caption and optional images |
| `update_post` | Update post caption or platform settings |
| `delete_post` | Delete a post |
| `attach_images_to_post` | Attach images from `export_urls` to an existing post |
| `schedule_post` | Schedule a post for future publishing to LinkedIn/Instagram |
| `unschedule_post` | Move a scheduled post back to drafts |
| `publish_post` | Publish immediately to LinkedIn/Instagram |

---

## Example Workflows

### Generate and Publish a Carousel

```
You: Create a LinkedIn carousel about 5 productivity tips and publish it

Claude:
1. Calls search_templates → shows carousel templates with thumbnails
2. "Which template would you like to use?"
3. Calls generate_ai_carousel with your choice
4. Polls check_job_status → gets export_urls
5. Calls get_social_accounts to verify LinkedIn is connected
   - If not connected: "Please connect LinkedIn at app.contentdrips.com/social-accounts"
   - If connected: continues...
6. Calls create_post with caption and export_urls
7. Calls publish_post with linkedin_publish=true
8. "Your carousel is being published to LinkedIn!"
```

### Schedule a Post for Later

```
You: Create a quote graphic and schedule it for tomorrow at 9am

Claude:
1. Calls generate_ai_graphic
2. Polls check_job_status → gets export_urls
3. Calls create_post with caption and images
4. Calls schedule_post with:
   - scheduled_time: "2024-03-16T09:00:00"
   - timezone: "America/New_York"
   - linkedin_publish: true
5. "Your post is scheduled for March 16 at 9am EST!"
```

### View and Manage Posts

```
You: Show me my scheduled posts

Claude:
1. Calls list_posts with status="scheduled"
2. Displays list with captions, scheduled times, and platforms

You: Unschedule the first one

Claude:
1. Calls unschedule_post with the UUID
2. "Post moved to drafts. You can edit or reschedule it later."
```

### Quick Publish After Generation

```
You: Turn this YouTube video into a carousel and post to LinkedIn
     https://youtube.com/watch?v=...

Claude:
1. Calls generate_ai_carousel with method="youtube"
2. Polls check_job_status
3. Calls get_social_accounts → confirms LinkedIn connected
4. Calls create_post with export_urls
5. Calls publish_post → starts publishing
6. "Publishing to LinkedIn now! It should appear shortly."
```

---

## Social Account Requirements

Before scheduling or publishing, you must have connected social accounts:

- **LinkedIn**: Connect at [app.contentdrips.com/social-accounts](https://app.contentdrips.com/social-accounts)
- **Instagram**: Connect your Instagram Business or Creator account

The MCP will check this automatically and provide the connect URL if needed.

---

## AI Credits Cost

| Method | Carousel | Graphic |
|--------|----------|---------|
| topic | 10 credits | 8 credits |
| blog | 12 credits | 10 credits |
| youtube | 12 credits | 10 credits |
| tiktok_reel | 12 credits | 10 credits |

---

## Local Development

```bash
# Install dependencies
npm install

# Create local env file
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your local URLs

# Start local server (runs on http://localhost:8787)
npm run dev

# Test with MCP Inspector (in a second terminal)
npx @modelcontextprotocol/inspector@latest
# Open http://localhost:5173
# Enter: http://localhost:8787/mcp/YOUR_API_KEY
```

## Deploy

```bash
npm run deploy
```

---

## Support

- Docs: [contentdrips.com/docs](https://contentdrips.com/docs)
- Email: support@contentdrips.com
