# ContentDrips MCP Server

A Model Context Protocol (MCP) server that lets AI assistants (Claude, Cursor, etc.) generate carousels and graphics directly via ContentDrips.

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

| Tool | What it does |
|------|-------------|
| `search_templates` | Search public ContentDrips templates — returns **thumbnail previews**, template ID, type, size, and last-edited date |
| `get_my_templates` | List your own saved templates — same rich view with thumbnails and last-edited date |
| `get_template_structure` | Inspect a template's editable fields and labels |
| `generate_ai_carousel` | Generate a carousel using AI from a topic, blog, YouTube URL, or TikTok/Reel URL |
| `generate_ai_graphic` | Generate a non-carousel graphic using AI (same input methods) |
| `generate_carousel` | Generate a carousel from a custom JSON carousel object |
| `generate_graphic` | Generate a graphic from a custom `content_update` array |
| `check_job_status` | Get the final `export_url` once a rendering job is complete |

---

## Example Conversations

### Browse templates visually

```
You: Show me some carousel templates

Claude:
1. Calls search_templates with query="carousel"
2. Displays each template with its thumbnail image preview,
   ID, type, dimensions, and last-edited date
```

### AI Carousel from a topic

```
You: Create a LinkedIn carousel about 5 tips for freelancers

Claude:
1. Searches for carousel templates (shows thumbnails)
2. Asks which template you prefer (or picks one)
3. Calls generate_ai_carousel with method="topic"
4. Polls check_job_status until complete
5. Returns the export_url with the rendered images
```

### AI Carousel from a YouTube video

```
You: Turn this YouTube video into a carousel: https://youtube.com/watch?v=...

Claude:
1. Calls generate_ai_carousel with method="youtube" and the URL
2. Returns export_url once rendering is complete
```

### AI Graphic from a topic

```
You: Create a quote graphic about morning routines using template 12345

Claude:
1. Calls generate_ai_graphic with method="topic"
2. Returns the export_url of the rendered image
```

### Custom JSON carousel

```
You: Generate a carousel with this exact content: [your JSON]

Claude:
1. Calls get_template_structure to validate the format
2. Calls generate_carousel with your JSON
3. Returns export_url with the image URLs
```

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
# Contentdrips-MCP
