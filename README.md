# ContentDrips MCP — Automate Social Media Graphics & Carousels

[ContentDrips](https://contentdrips.com) MCP lets AI agents **automate social media graphics**, **LinkedIn carousels**, and **Instagram carousels** from chat. Describe the post. The agent designs it, keeps your brand style, and can schedule or publish.

Works with **OpenClaw**, **Grok** (Grok Build / Grok bot), **Claude**, **Cursor**, **ChatGPT**, and any MCP-compatible client.

**MCP URL:** [`https://mcp.contentdrips.com/mcp`](https://mcp.contentdrips.com/mcp)

OpenClaw skill for social media automation · Grok bot for LinkedIn & Instagram · AI Design Agent that designs in your style

---

## What you can automate

| Use case | What happens |
|----------|----------------|
| **Social media carousel automation** | Multi-slide LinkedIn and Instagram carousels from a topic, blog, YouTube, or TikTok URL |
| **Social media graphics** | Quote cards, ads, infographics, and single-image posts in your brand |
| **AI Design Agent** | New layouts in **your saved visual style** — typography, colors, spacing. Optional reference image (“recreate this”) |
| **Social media automation** | Draft, schedule, and publish to **LinkedIn** and **Instagram** without opening the editor |
| **OpenClaw / Grok skills** | Drop in the [ContentDrips skill](skills/contentdrips/SKILL.md) so the agent already knows the workflows |

You stay in the conversation. The agent uses ContentDrips tools; you get an [editor link](https://app.contentdrips.com) when you want to tweak.

---

## AI Design Agent — designs in your style

The **AI Design Agent** is the default when you do not name a template. It builds a full layout (not just fill-in-the-blanks copy) and applies a **saved brand style** from your ContentDrips workspace.

1. Agent loads your workspaces (`get_profiles`) and saved styles (`get_brand_styles`)
2. If you have more than one style, it **asks which to use** — it does not auto-pick
3. You can attach a picture as `reference_image` (“recreate this in my style”)
4. You get an **Open in editor** link. Export PNG/PDF only if you ask to preview, download, or publish

If you **do** name a template (or paste a template ID), the agent keeps that layout and fills new content (topic / blog / YouTube / TikTok). Design Agent on an existing design only runs if you explicitly ask to override or recreate it.

---

## Examples

Copy these into OpenClaw, Grok, Claude, or Cursor after MCP is connected.

**LinkedIn carousel from a topic**
```
Create a 5-slide LinkedIn carousel on "how to price freelance work".
Use my brand style. Don't publish yet — just give me the editor link.
```

**Instagram carousel from a blog**
```
Turn this blog into an Instagram carousel and keep my template layout:
https://example.com/10-tips-for-creators
Template ID 5821. Then draft a caption. Publish to Instagram only after I confirm.
```

**Social media graphics in your style**
```
Design a square quote graphic: "Ship weekly, not perfectly."
Warm terracotta, serif headline, my branding. Recreate the layout of this image if I attach one.
```

**YouTube → LinkedIn carousel automation**
```
Use my Blue Corporate template. Turn this YouTube into a LinkedIn carousel and schedule it
for Tuesday 9am New York. LinkedIn only.
https://youtube.com/watch?v=...
```

**Grok bot / OpenClaw — full social automation**
```
Show my scheduled posts. Create a new carousel from "3 mistakes new managers make",
attach the slides to a LinkedIn post with a short caption, and ask me before publishing.
```

**Manual JSON fill** (full control over fields — not the AI maker):

- Carousel payload: [`skills/contentdrips/examples/carousel_content.json`](skills/contentdrips/examples/carousel_content.json)
- Graphic payload: [`skills/contentdrips/examples/content_update.json`](skills/contentdrips/examples/content_update.json)

---

## OpenClaw skill for social media automation

The skill folder is [`skills/contentdrips/`](skills/contentdrips/). It follows the [Agent Skills](https://agentskills.io/specification) spec, so the **same files** work in OpenClaw, Grok Build, Claude Code, Cursor, and similar agents.

Download [`contentdrips-skill.zip`](contentdrips-skill.zip) or copy the folder:

```
contentdrips/
  SKILL.md
  examples.md
  examples/
    carousel_content.json
    content_update.json
```

### OpenClaw

```bash
export CONTENTDRIPS_API_KEY=your_api_key_here

openclaw mcp set contentdrips "{
  \"type\": \"streamable-http\",
  \"url\": \"https://mcp.contentdrips.com/mcp\",
  \"headers\": { \"Authorization\": \"Bearer $CONTENTDRIPS_API_KEY\" }
}"

mkdir -p ~/.openclaw/workspace/skills/contentdrips
cp -r skills/contentdrips/* ~/.openclaw/workspace/skills/contentdrips/
```

### Grok (Grok Build / Grok bot)

1. Add the MCP server with the same URL and `Authorization: Bearer` header
2. Copy the skill to `~/.grok/skills/contentdrips/` or `./.grok/skills/contentdrips/`

That is the setup for **Grok bot social media automation** and **OpenClaw skills for social media automation**: MCP for tools, skill for workflows (Design Agent vs template fill, LinkedIn vs Instagram, no auto-publish).

### Claude Code, Cursor, Codex

Copy `skills/contentdrips/` into that product’s skills directory (for example `.claude/skills/contentdrips/` or `.cursor/skills/contentdrips/`), and register MCP as below.

---

## Connect MCP (API key in a header, not in the URL)

1. Log in at [app.contentdrips.com](https://app.contentdrips.com)
2. **Settings → API Tokens** → create a token

**MCP URL:** `https://mcp.contentdrips.com/mcp`  
**Auth:** `Authorization: Bearer YOUR_API_KEY`

### Claude (claude.ai)

**Settings → Integrations → Add Integration** → `https://mcp.contentdrips.com/mcp` → authorize with your API key.

### Claude Code

```bash
claude mcp add --transport http contentdrips https://mcp.contentdrips.com/mcp \
  --header "Authorization: Bearer YOUR_API_KEY_HERE"
```

### Cursor

**Settings → MCP → Add MCP Server**

- Type: HTTP
- URL: `https://mcp.contentdrips.com/mcp`
- Headers: `Authorization: Bearer YOUR_API_KEY_HERE`

Or `~/.cursor/mcp.json`:

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

Full client matrix (Claude Desktop, ChatGPT, and others): [`CONTENTDRIPS_MCP_OVERVIEW.md`](CONTENTDRIPS_MCP_OVERVIEW.md).

---

## How creation works

| Path | When | Result |
|------|------|--------|
| **AI Design Agent** | No template ID/name | New layout in your style → editor link (no auto-export) |
| **AI carousel / graphic maker** | You named a template | **Keeps** layout; fills topic, blog, YouTube, or TikTok |
| **Manual JSON** | You want every field | `carousel_content` or `content_update` after `get_template_structure` |

Always pass a workspace `profile_id`. Publish **only** to LinkedIn and/or Instagram if you named them — never both by default.

Connect accounts at [app.contentdrips.com/social-accounts](https://app.contentdrips.com/social-accounts).

---

## Tools (28)

**Designs:** `get_template_categories`, `search_templates`, `get_my_templates`, `get_template`, `get_template_structure`, `create_graphic`, `delete_graphic`

**AI:** `get_brand_styles`, `run_ai_design_agent`, `generate_ai_carousel`, `generate_ai_graphic`, `generate_carousel`, `generate_graphic`, `render_template`, `check_job_status`

**Workspaces & social:** `get_profiles`, `get_social_accounts`

**Posts:** `list_posts`, `get_post`, `create_post`, `update_post`, `delete_post`, `set_post_images`, `upload_images_to_post`, `remove_images_from_post`, `schedule_post`, `unschedule_post`, `publish_post`

---

## AI credits (maker tools)

| Method | Carousel | Graphic |
|--------|----------|---------|
| topic | 10 | 8 |
| blog / YouTube / TikTok reel | 12 | 10 |

---

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # point at local Laravel + renderer
npm run dev                      # http://localhost:8787
```

```bash
npm run deploy
```

---

## Links

- Product: [contentdrips.com](https://contentdrips.com) — social media carousel maker and graphic automation
- App: [app.contentdrips.com](https://app.contentdrips.com)
- Skill: [`skills/contentdrips/SKILL.md`](skills/contentdrips/SKILL.md)
- Marketing / setup overview: [`CONTENTDRIPS_MCP_OVERVIEW.md`](CONTENTDRIPS_MCP_OVERVIEW.md)
- API: [developer.contentdrips.com](https://developer.contentdrips.com)
- Support: support@contentdrips.com
