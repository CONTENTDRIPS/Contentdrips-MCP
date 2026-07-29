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

### OpenClaw

See `skills/contentdrips/SKILL.md` for full setup. Quick version:

```bash
export CONTENTDRIPS_API_KEY=your_api_key_here

openclaw mcp set contentdrips "{
  \"type\": \"streamable-http\",
  \"url\": \"https://mcp.contentdrips.com/mcp\",
  \"headers\": { \"Authorization\": \"Bearer $CONTENTDRIPS_API_KEY\" }
}"
```

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
| `get_template_categories` | List public template categories (carousel, quote, etc.) |
| `search_templates` | Search/browse public templates by category or keyword — markdown table with editor links |
| `get_my_templates` | List your saved templates when you ask to show/pick one |
| `get_template` | Look up one design by ID or name — details + editor link |
| `get_template_structure` | Inspect a template's editable fields and labels |
| `create_graphic` | Create a blank design — first step when creating without a template ID |
| `delete_graphic` | Permanently delete a design |

### Generation Tools

| Tool | What it does |
|------|-------------|
| `run_ai_design_agent` | **Preferred** for new designs: design/edit via AI Design Agent → editor link |
| `generate_ai_carousel` | Fill an **existing** carousel template from topic/blog/YouTube/TikTok (needs template ID) |
| `generate_ai_graphic` | Fill an **existing** graphic template from the same sources (needs template ID) |
| `generate_carousel` | Fill existing carousel with `carousel_content` JSON (template ID required) |
| `generate_graphic` | Fill existing graphic with `content_update` array (template ID required) |
| `render_template` | Export current design as PNG/PDF by template ID (after Design Agent or any saved design) |
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

### Post Image Tools

| Tool | What it does |
|------|-------------|
| `set_post_images` | Attach ContentDrips `export_urls` to a post |
| `upload_images_to_post` | Upload external images (URLs or base64) and attach to a post |
| `remove_images_from_post` | Remove all images from a post |

### Publishing Tools

| Tool | What it does |
|------|-------------|
| `schedule_post` | Schedule for future — pass explicit platform booleans (only platforms the user named) |
| `unschedule_post` | Move a scheduled post back to drafts |
| `publish_post` | Publish immediately — explicit platforms only; confirm naming platforms first |

---

## Example Workflows

### Create from Scratch (AI Design Agent — default)

```
You: Create a 3-slide carousel about 5 productivity tips

Claude:
1. Asks (if needed): blank + AI Design Agent (recommended) vs fill an existing template?
2. Calls create_graphic(type="carousel", slides=3, format=...) → template_id
3. Calls run_ai_design_agent(template_id, prompt=...)
4. Shares editor link; to export PNG: render_template → check_job_status → export_url(s)
```

### Fill an Existing Template and Publish

```
You: Use template 5821, create a LinkedIn carousel about 5 productivity tips and publish it

Claude:
1. Calls generate_ai_carousel with template_id=5821
2. Polls check_job_status → gets export_urls
3. Calls get_social_accounts to verify LinkedIn is connected
4. Calls create_post with caption and export_urls
5. Calls publish_post with linkedin_publish=true, instagram_publish=false (after confirmation naming LinkedIn)
```

### Schedule a Post for Later

```
You: Create a square quote graphic about email marketing and schedule it for tomorrow at 9am

Claude:
1. Calls create_graphic(type="graphic", format="square") → run_ai_design_agent
2. Calls render_template → check_job_status → export_urls
3. Calls create_post / schedule_post with images
```

### Export PNG of an existing design

```
You: Export template 163500 as PNG

Claude:
1. get_template / know type → carousel or graphic
2. render_template(template_id, profile_id, type, output="png")
3. check_job_status → export_url(s)
```

### Quick Publish from YouTube (with template)

```
You: Use my Blue Corporate template — turn this YouTube into a carousel and post to LinkedIn
     https://youtube.com/watch?v=...

Claude:
1. Resolves template ID (user named it or gave an ID)
2. Calls generate_ai_carousel with method="youtube"
3. Polls check_job_status → create_post → publish_post(linkedin_publish=true, instagram_publish=false) after confirmation
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
