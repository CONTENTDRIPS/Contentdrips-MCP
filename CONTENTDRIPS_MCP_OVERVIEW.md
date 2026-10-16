# ContentDrips MCP — Complete Overview

> **For Marketing Use** — This document covers everything about the ContentDrips MCP: what it is, what it can do, all tools, use cases, and setup instructions for every supported AI client.

---

## What is ContentDrips MCP?

ContentDrips MCP (Model Context Protocol) is a bridge that connects AI assistants — like Claude, Cursor, and any MCP-compatible agent — directly to your ContentDrips account. Instead of switching between your AI chat and the ContentDrips web app, you can create, generate, manage, and publish social media content entirely through natural conversation.

**MCP Server URL:** `https://mcp.contentdrips.com/mcp`

---

## What Can It Do?

ContentDrips MCP gives AI assistants the ability to:

- 🎨 **Browse your designs** — search templates by category or keyword, list your saved designs, inspect structure
- ✨ **Generate AI-powered content** — turn a topic, blog post, YouTube video, or TikTok URL into a ready-to-post carousel or graphic
- 🤖 **Design from scratch with AI** — describe what you want and the AI Design Agent creates the full Fabric.js layout: typography, colors, shapes, images
- 📝 **Manage posts** — create, edit, schedule, publish, and delete social media posts
- 🖼️ **Attach images to posts** — from ContentDrips renders or uploaded externally
- 📅 **Publish to LinkedIn & Instagram** — schedule ahead or publish immediately
- 🗂️ **Manage workspaces** — switch between profiles, filter content by workspace

---

## How Creation Should Work (MAIN FLOW)

**Know the difference:**

| Tool | Effect |
|------|--------|
| **AI Design Agent** | New AI layout. Default when the user did **not** name a template. On an existing template it **overrides/removes** the current design — use only if they explicitly ask to recreate. |
| **Exact copy** (`generate_carousel` / `generate_graphic`) | Needs a **template ID**. The user already wrote each slide or the graphic text. Copy `value`s verbatim. **Show that text and wait for a yes** before calling the tool. |
| **AI carousel / graphic maker** | Needs a **template ID or name** plus a topic, blog, YouTube, or TikTok URL. **Keeps** layout. ContentDrips **writes** the copy. Do not use when the text is already written. |

**Route by the copy** (template = design = graphic = carousel = infographic):

1. **No ID or name:** AI Design Agent. `get_profiles` → `create_graphic(profile_id)` → `get_brand_styles` (if 2+ ASK which) → `run_ai_design_agent` (pass `reference_image` if they uploaded a picture) → **share the editor link and STOP**.
2. **Has ID or name, and the user wrote the text:** `get_template` → `get_template_structure` → show the mapped text → wait for yes → `generate_carousel` / `generate_graphic`.
3. **Has ID or name, and they gave a topic or URL:** `get_template` → `get_template_structure` → `generate_ai_carousel` / `generate_ai_graphic` → `check_job_status`.
4. **Override an existing design:** only if they explicitly ask to recreate the layout (or recreate from a reference image).

**Workspaces first:** always call `get_profiles` before create / generate / render / schedule / publish. If 2+ workspaces, ask which. Always pass `profile_id`.

**Do not auto-export:** after Design Agent, share `edit_url` only. Call `render_template` → `check_job_status` only if they ask to preview, download PNG/PDF, attach to a post, or publish.

**Platforms:** only LinkedIn and/or Instagram as named — never add the other.

---

## Key Use Cases

### 1. Design from Scratch (AI Design Agent on blank)
No template named → `get_profiles` → `create_graphic(profile_id)` → `get_brand_styles` (ask style if 2+; ask Pro if available) → `run_ai_design_agent` (pass `reference_image` if they uploaded a picture) → share editor link and stop. Export PNG/PDF only if they ask.

### 2. Template ID + the user's own text (exact copy)
User wrote each slide or the graphic copy → `get_template` → `get_template_structure` → show that text → wait for yes → `generate_carousel` / `generate_graphic`. Do not use the AI maker.

### 3. Template ID + new topic/URL (AI maker)
User named a template and gave a topic, blog, YouTube, or TikTok URL → `get_template` → `get_template_structure` → `generate_ai_carousel` / `generate_ai_graphic`. Use Design Agent on that template only if they explicitly ask to override/recreate the layout.

### 4. Social post (LinkedIn or Instagram)
Same MAIN FLOW. Publish **only** the platform they named.

### 5. End-to-End Social Publishing Workflow
*"Generate a carousel from my blog post, create a LinkedIn post with the caption I'll give you, attach the carousel images, and schedule it for Monday 9am New York time."* All in a single conversation.

### 6. Manage Your Content Calendar
*"Show me all my scheduled posts"* or *"Unschedule the post from last Tuesday"* — browse, reschedule, and manage your queue without opening the app.

### 7. Quick Template Lookup
*"Get details of template 149900"* or *"Show me my FB Ad Creative v1 design"* — returns metadata and an **Open in editor** link. Template tools use markdown text (no inline image previews) so they work in any MCP client.

---

## Tools Reference

### 🗂️ Template & Design Tools

| Tool | What It Does |
|------|--------------|
| `get_template_categories` | List public template categories (carousel, quote, tweet style, LinkedIn topics, etc.). Use before browsing by category. |
| `search_templates` | Browse/search public templates when the user asks to show or pick one — not for silent auto-selection. |
| `get_my_templates` | List your saved designs when you ask to show or pick one — not for silent auto-selection before creation. |
| `get_template` | Look up a single design by ID or name. Returns markdown details and an editor link. |
| `get_template_structure` | **Required** before an exact fill, the AI maker, or `edit_template`. Inspect a template's editable field structure (labels, types). |
| `create_graphic` | Create a new blank design. **First step** when creating without a template ID (then usually run AI Design Agent). Always pass `profile_id`. Choose type, format, slides, workspace. Custom sizes: 100–3000 px. |
| `delete_graphic` | Permanently delete a design. Removes canvas JSON, thumbnail from S3, and all related records. Asks for confirmation. |

---

### 🤖 AI Generation Tools

| Tool | What It Does |
|------|--------------|
| `get_brand_styles` | List saved visual styles and whether Pro model is available. Call before Design Agent; ask if 2+ styles or Pro is available. |
| `run_ai_design_agent` | New AI layout. Default when no template is named, or to **override** an existing design (only if they explicitly ask). Pass `style_id`, `model`, and `reference_image` if they uploaded a picture. Share `edit_url` and stop — do **not** auto-export. |
| `generate_ai_carousel` | **AI carousel maker** — keep the layout and write copy from a topic, blog, YouTube, or TikTok URL. Do not use when the user already wrote the slides. |
| `generate_ai_graphic` | Same for graphic/quote templates. Do not use when the user already wrote the graphic text. |
| `generate_carousel` | Place the user's own slide text. Show it and wait for a yes, then pass `carousel_content`. `template_id` required. |
| `generate_graphic` | Place the user's own graphic text. Show each field and wait for a yes, then pass `content_update`. `template_id` required. |
| `render_template` | Export the **current** saved design as PNG/PDF by `template_id`. Use **only** when the user asks to preview, download, attach to a post, or publish — not automatically after Design Agent. |
| `check_job_status` | Poll a render job. Returns `export_url(s)` — the final PNG/PDF download links — when complete. |

---

### 👤 Workspace & Social Account Tools

| Tool | What It Does |
|------|--------------|
| `get_profiles` | List ContentDrips workspaces (profiles) with their IDs. **Always call first** before create, generate, render, schedule, or publish. If 2+ workspaces, ask which. Always pass `profile_id`. |
| `get_social_accounts` | Show connected LinkedIn and Instagram accounts for a profile. Includes a connect URL if none are linked. |

---

### 📮 Post Management Tools

| Tool | What It Does |
|------|--------------|
| `list_posts` | List posts filtered by status: `draft`, `scheduled`, `published`, `publishing`, `failed`, or all. |
| `get_post` | Get full details of a single post: caption, images, status, scheduled time, error logs, and a direct link. |
| `create_post` | Create a new draft post with a caption. Optionally attach images and choose a workspace. |
| `update_post` | Edit a post's caption or toggle LinkedIn/Instagram publishing. |
| `delete_post` | Permanently delete a post. |

---

### 🖼️ Post Image Tools

| Tool | What It Does |
|------|--------------|
| `set_post_images` | Attach ContentDrips-rendered images to a post. Pass the `export_url(s)` from `check_job_status` directly — no re-uploading needed. |
| `upload_images_to_post` | Upload external images (URLs or base64) to ContentDrips S3 and attach them to a post. Supports multiple images at once. |
| `remove_images_from_post` | Remove all images from a post and delete the files from S3. |

---

### 📅 Publishing Tools

| Tool | What It Does |
|------|--------------|
| `schedule_post` | Schedule a post to publish at a future date and time. Supports timezone, LinkedIn, and Instagram. |
| `unschedule_post` | Cancel a scheduled post and move it back to drafts. |
| `publish_post` | Publish immediately. Requires explicit `linkedin_publish` / `instagram_publish` booleans for **only** platforms the user named. Confirm naming platforms first. |

---

## Example Conversations

### Create from scratch (AI Design Agent — no template named)
```
You: "Create me a 3-slide carousel on the topic of '3 ways to grow beard'"
AI:  [get_profiles → create_graphic → get_brand_styles → run_ai_design_agent]
     "AI design complete! View & edit: https://app.contentdrips.com/canvas?template=..."
     (stops here — no auto-export)
```

### Make a LinkedIn or Instagram post (named template + topic → AI maker)
```
You: "Make a LinkedIn post about why remote work is great, with a short caption. Use template 5821."
AI:  [get_profiles → get_template → get_template_structure → generate_ai_graphic method=topic]
     [create_post + set_post_images]
     "Publish to LinkedIn only right now? Reply yes to confirm."
```

### Use the user's exact slide text
```
You: "Use template 5821. Slide 1 heading: Ship weekly. Slide 1 body: Small releases beat big launches. Slide 2 heading: Ask for the sale. Don't change my words."
AI:  [get_template → get_template_structure]
     "Here's the text I'll place:
      Slide 1 — heading: Ship weekly
      Slide 1 — body: Small releases beat big launches
      Slide 2 — heading: Ask for the sale
      Use this text exactly?"
You: "Yes"
AI:  [generate_carousel]
```

### New topic on a template you like (AI maker — keep layout)
```
You: "I like this template but I have a new topic '3 ways to grow email list'. I want that over this template."
AI:  [get_template → get_template_structure → generate_ai_carousel or generate_ai_graphic]
     "Rendering… Done! Export URLs: [PNG links]"
```

### Fill an existing template from a URL
```
You: "Create a carousel from this blog post: https://myblog.com/10-tips-for-linkedin, use template 5821"
AI:  [get_template → get_template_structure → generate_ai_carousel]
     "Your carousel is rendering! Job ID: abc123. Checking status..."
     [Polls job status]
     "Done! Here are your export URLs: [PNG links]"
```

### Design with AI Design Agent (export only if asked)
```
You: "Create a new square graphic called 'Morning Motivation', then design it as an
      inspirational quote with a warm terracotta background, serif fonts, include my branding."
AI:  [get_profiles → create_graphic → get_brand_styles → run_ai_design_agent]
     "AI design complete! View & edit: https://app.contentdrips.com/canvas?template=163500"

You: "Download the PNG"
AI:  [render_template → check_job_status]
     "PNG export: [export_url]"
```

### Recreate from a reference image
```
You: "Recreate this in my brand style" [uploads image]
AI:  [get_profiles → create_graphic → get_brand_styles → run_ai_design_agent with reference_image]
     "AI design complete! View & edit: https://app.contentdrips.com/canvas?template=..."
```

### Full publish workflow
```
You: "Show me my scheduled posts."
AI:  [Lists posts with UUIDs]

You: "Reschedule post abc-123 to Friday at 10am EST."
AI:  [Updates schedule] "Done! Rescheduled for Friday 2026-05-29 15:00:00 UTC."

You: "Actually, publish it now."
AI:  "Publish to LinkedIn only, Instagram only, or both? Reply to confirm."
You: "LinkedIn only"
AI:  "Publishing to LinkedIn... Status: publishing"
```

### Instagram-only publish (no LinkedIn)
```
You: "Publish this to Instagram"
AI:  "Publish to Instagram only right now? Reply yes to confirm."
You: "Yes."
AI:  [publish_post with linkedin_publish=false, instagram_publish=true]
```

### Upload your own image to a post
```
You: "Create a post with caption 'Big news coming soon!' and attach this image: [URL]"
AI:  [Creates post, uploads image to ContentDrips S3]
     "Post created! UUID: xyz-456
      View/Edit: https://app.contentdrips.com/make-post?id=xyz-456
      1 image uploaded and attached."
```

---

## Getting Your API Key

1. Log in to [app.contentdrips.com](https://app.contentdrips.com)
2. Go to **Settings → API Tokens**
3. Click **Create Token**, give it a name, and copy the key
4. Use this key when connecting your AI client (see setup below)

---

## Setup Guide

### OpenClaw

1. Get your API key from **Settings → API Tokens** at [app.contentdrips.com](https://app.contentdrips.com)
2. Register the MCP server (see `skills/contentdrips/SKILL.md`)
3. Optionally install the ContentDrips skill into your OpenClaw workspace

---

### Claude Web (claude.ai)

1. Go to [claude.ai](https://claude.ai) → **Settings → Integrations**
2. Click **Add Integration**
3. Enter the MCP URL: `https://mcp.contentdrips.com/mcp`
4. Click **Connect** — Claude will redirect you to the ContentDrips authorization page
5. Enter your ContentDrips API key and click **Authorize**
6. Done — the ContentDrips tools appear in every new Claude conversation

---

### Claude Code (CLI)

Add to your `~/.claude.json` (or run `claude mcp add`):

```json
{
  "mcpServers": {
    "contentdrips": {
      "type": "http",
      "url": "https://mcp.contentdrips.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}
```

Or via CLI:
```bash
claude mcp add --transport http contentdrips https://mcp.contentdrips.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY_HERE"
```

---

### Cursor

1. Open Cursor → **Settings** (`Cmd/Ctrl + ,`) → **MCP**
2. Click **Add MCP Server**
3. Fill in:
   - **Name:** ContentDrips
   - **Type:** HTTP
   - **URL:** `https://mcp.contentdrips.com/mcp`
   - **Headers:** `Authorization: Bearer YOUR_API_KEY_HERE`
4. Click **Save** — Cursor will load all ContentDrips tools automatically

Or add to your `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "contentdrips": {
      "type": "http",
      "url": "https://mcp.contentdrips.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY_HERE"
      }
    }
  }
}
```

---

### Grok Build and other Agent Skills clients

The `skills/contentdrips/SKILL.md` file follows the [Agent Skills](https://agentskills.io/specification) spec, so the same skill folder works in OpenClaw, Grok Build, Claude Code, Cursor, Codex, and similar agents.

1. Register the MCP server with the URL and Bearer token above (each client has its own MCP config).
2. Copy `skills/contentdrips/` into that client’s skills directory, for example:
   - OpenClaw: `~/.openclaw/workspace/skills/contentdrips/`
   - Grok Build: `~/.grok/skills/contentdrips/` or `./.grok/skills/contentdrips/`
   - Claude Code: `~/.claude/skills/contentdrips/` or `.claude/skills/contentdrips/`

The skill teaches the agent **how** to use the tools. MCP still has to be connected separately.

---

### Any MCP-Compatible Client

The server follows the standard MCP protocol over HTTP with SSE transport. Use:

- **URL:** `https://mcp.contentdrips.com/mcp`
- **Auth:** `Authorization: Bearer YOUR_CONTENTDRIPS_API_KEY`

---

## Content Format Support

| Input Method | Carousel | Graphic |
|---|---|---|
| Free-text topic | ✅ | ✅ |
| Blog post URL | ✅ | ✅ |
| YouTube video URL | ✅ | ✅ |
| TikTok / Reel URL | ✅ | ✅ |
| Manual JSON structure | ✅ | ✅ |
| AI Design Agent (free-form prompt) | ✅ | ✅ |

| Output Format | Supported |
|---|---|
| PNG | ✅ |
| PDF | ✅ |

| Social Platform | Supported |
|---|---|
| LinkedIn | ✅ |
| Instagram | ✅ |

---

## Design Format Presets

When creating a design, these format shortcuts are available:

| Format | Dimensions | Best For |
|---|---|---|
| `square` | 1080 × 1080 px | Instagram, LinkedIn |
| `portrait` | 1080 × 1350 px | Instagram portrait |
| `tiktok` | 1080 × 1920 px | TikTok, Stories, Reels |
| `landscape` | 1920 × 1080 px | LinkedIn banners, Twitter |
| `custom` | 100–3000 px (specify width + height) | Any custom size — pass `format: "custom"` with both dimensions |

Carousels: total canvas width = number of slides × slide width.

---

## Privacy & Security

- Your ContentDrips API key is sent with every request over HTTPS and never stored on the MCP server
- The MCP server is stateless — no user data is retained between requests
- All generated assets are stored in your ContentDrips S3 bucket under your account
- OAuth 2.0 authorization flow is used for Claude Web to securely exchange credentials

---

*ContentDrips MCP — mcp.contentdrips.com*
