---
name: contentdrips
description: >-
  Connect OpenClaw to ContentDrips MCP for social media design and publishing.
  MAIN FLOW: user-written slide or graphic text on a named template uses
  generate_carousel or generate_graphic (show the text, wait for yes). A topic
  or URL uses generate_ai_carousel or generate_ai_graphic. No template uses
  AI Design Agent. edit_template is for a font, color, or image tweak, then SAVE.
  Always get_template_structure before a fill or edit_template.
  Platforms explicit. Use when creating designs, posts, or publishing to
  LinkedIn/Instagram.
---

# ContentDrips MCP Skill

ContentDrips MCP connects your agent to [ContentDrips](https://contentdrips.com) — create designs, generate AI carousels/graphics, run the AI Design Agent, manage posts, and publish to LinkedIn and Instagram through conversation.

**MCP URL:** `https://mcp.contentdrips.com/mcp`

**Triggers:** contentdrips, carousel, graphic, design, template, social post, LinkedIn, Instagram, schedule post, publish post, AI design agent, my designs, my templates, template categories

---

## Setup (run once)

### 1. Get an API key

1. Log in at [app.contentdrips.com](https://app.contentdrips.com)
2. Go to **Settings → API Tokens**
3. Create a token and copy it

### 2. Register the MCP server in OpenClaw

Export your key, then register the server. Use your actual key in the header (single-quoted JSON does not expand shell variables):

```bash
export CONTENTDRIPS_API_KEY=your_api_key_here

openclaw mcp set contentdrips "{
  \"type\": \"streamable-http\",
  \"url\": \"https://mcp.contentdrips.com/mcp\",
  \"headers\": { \"Authorization\": \"Bearer $CONTENTDRIPS_API_KEY\" }
}"
```

Or paste the key directly: `"Authorization": "Bearer cd_xxxx..."`

### 3. Verify

```bash
openclaw mcp list
```

You should see `contentdrips` with status active. All tools below are then available via MCP.

### 4. Install this skill (optional)

Copy this folder into your OpenClaw workspace:

```bash
mkdir -p ~/.openclaw/workspace/skills/contentdrips
cp -r /path/to/contentdrips-mcp/skills/contentdrips/* ~/.openclaw/workspace/skills/contentdrips/
```

---

## Important URLs

| Resource | URL pattern |
|----------|-------------|
| Edit design | `https://app.contentdrips.com/canvas?template={TEMPLATE_ID}` |
| Edit post | `https://app.contentdrips.com/make-post?id={POST_UUID}` |
| Connect social accounts | `https://app.contentdrips.com/social-accounts` |

Always share these links with the user after creating a design or post.

---

## Agent rules

1. **Workspaces first (always)** — call `get_profiles` before `create_graphic`, `create_post`, `generate_*`, `edit_template`, `render_template`, schedule, or publish. If 2+ workspaces, ASK which. Always pass `profile_id`. Never tell the user you lack a profile_id — fetch it.
2. **MAIN FLOW — route by whether they named a template** (template = design = graphic = carousel = infographic):
   - **No ID or name:** AI Design Agent. `get_profiles` → `create_graphic(profile_id)` → `get_brand_styles` (if 2+ ASK which) → `run_ai_design_agent` (pass `reference_image` if they uploaded a picture) → **share the editor link and STOP**.
   - **Has ID or name + the user already wrote the slide or graphic text:** exact fill. `get_template` → `get_template_structure` → map their sentences verbatim → **show that text and wait for yes** → `generate_carousel` (`carousel_content`) or `generate_graphic` (`content_update`) → `check_job_status`. Do **not** call `generate_ai_*`.
   - **Has ID or name + new topic/URL (AI writes the copy):** `get_template` → `get_template_structure` → `generate_ai_carousel` / `generate_ai_graphic` → `check_job_status`.
   - **Has ID or name + style/image/color/text tweak** ("make headings bigger", "change this image", "this color"): `get_template` → `get_template_structure` → `edit_template` (SAVES). Do **not** use Design Agent.
   - Use Design Agent on an existing template only if they explicitly ask to override/recreate the layout (or recreate from a reference image).
3. **Confirm before publish — platforms matter** — confirm **naming platforms** (e.g. "Publish to LinkedIn only?" / "Publish to Instagram only?"). Set explicit booleans for **only** platforms they named — never add LinkedIn when they asked for Instagram, or Instagram when they asked for LinkedIn.
4. **Confirm before delete** — ask before `delete_graphic` or `delete_post`.
5. **Design synonyms** — "designs", "graphics", "creatives", "templates", "infographics", and "carousels" all map to ContentDrips templates.
6. **Platforms — LinkedIn and Instagram equally** — only schedule/publish to platforms the user explicitly named. LinkedIn-only → `linkedin_publish=true`, `instagram_publish=false`. Instagram-only → opposite. Ask if unclear.
7. **Do not auto-export** — after Design Agent or `edit_template`, share `edit_url` only. Call `render_template` → `check_job_status` **only** if they ask to preview, download PNG/PDF, attach to a post, or publish. Never say export is unavailable.
8. **Style + model before Design Agent** — call `get_brand_styles` before every `run_ai_design_agent`. If 2+ saved styles, ASK which to use (or none) — never auto-pick. If exactly 1, use it unless they declined. If Pro is available (`can_use_pro_model`), ASK Basic vs Pro (default Basic). Pass `style_id` and `model`.
9. **Reference images (ChatGPT)** — if the user uploads an image (“recreate this”, “use this as reference”), pass it to `run_ai_design_agent` as `reference_image` (https URL preferred, or data URI). Claude typically cannot pass chat images to MCP.
10. **Post images — two paths only:**
   - ContentDrips exports → `set_post_images` with `export_urls` from `check_job_status`
   - External/user images → `upload_images_to_post` with `image_urls` (prefer URLs over base64; base64 fails above ~4 MB)
11. **Before scheduling/publishing** — call `get_social_accounts` for the profile. If the requested platform is not connected, tell the user to connect at the social-accounts URL above. Do not publish to a different connected platform as a substitute.
12. **Text-only tool output** — share the **Open in editor** link when the user wants to see a design. Do not start a render job just to show them the design.
13. **Custom canvas sizes** — `create_graphic` with `format: "custom"`, `width`, and `height` (100–3000 px). Do not fall back to a preset.
14. **Browse by category** — only when the user asks to show/find templates, or after they chose an existing template and need help picking one.

---

## Tools (29)

### Templates & designs

| Tool | Use when |
|------|----------|
| `get_template_categories` | List public template categories (carousel, quote, LinkedIn, etc.) |
| `search_templates` | Browse/search public templates by `category` and/or `query` keyword |
| `get_my_templates` | List user's designs when they ask to show/pick; never auto-pick for creation |
| `get_template` | Look up one design by ID or name (markdown details + editor link) |
| `get_template_structure` | **Required** before exact fill, AI maker, or `edit_template` (includes current fontSize/fontColor) |
| `create_graphic` | New blank design — first step when creating without a template ID |
| `delete_graphic` | Permanently delete a design |

**`create_graphic` formats:**

| Format | Dimensions |
|--------|------------|
| `square` | 1080 × 1080 |
| `portrait` | 1080 × 1350 |
| `tiktok` | 1080 × 1920 |
| `landscape` | 1920 × 1080 |
| `custom` | any width × height (100–3000 px each) |

For `custom`, always pass `format: "custom"` plus both `width` and `height`. Carousels: set `slides` (default 3).

### AI generation & design

| Tool | Use when |
|------|----------|
| `get_brand_styles` | **Required** before `run_ai_design_agent` — list saved styles + Pro eligibility; ask if 2+ styles or Pro is available |
| `run_ai_design_agent` | New blank layout, or **override** existing design (ask + warn first). Pass `style_id` and `model`. |
| `generate_ai_carousel` | Template ID + topic/URL — AI writes the carousel copy. Not for text the user already wrote |
| `generate_ai_graphic` | Template ID + topic/URL — AI writes the graphic copy. Not for text the user already wrote |
| `generate_carousel` | User wrote each slide. Show the text, wait for yes, then `carousel_content` |
| `generate_graphic` | User wrote the graphic copy. Show each field, wait for yes, then `content_update` |
| `edit_template` | Surgical edit + **save**: fontSize, fontColor, image URL, text. `value` optional for style-only. After `get_template_structure` |
| `render_template` | Export current design as PNG/PDF by `template_id` (after Design Agent, edit_template, or any saved design) |
| `check_job_status` | Poll render job → get `export_url`(s) |

### Workspaces & social

| Tool | Use when |
|------|----------|
| `get_profiles` | List workspaces (profiles) |
| `get_social_accounts` | LinkedIn/Instagram connected for a profile |

### Posts

| Tool | Use when |
|------|----------|
| `list_posts` | List by status: draft, scheduled, published, etc. |
| `get_post` | Single post details |
| `create_post` | New draft with caption |
| `update_post` | Edit caption or platform flags |
| `delete_post` | Delete post |

### Post images

| Tool | Use when |
|------|----------|
| `set_post_images` | Attach ContentDrips `export_urls` to a post |
| `upload_images_to_post` | Upload external images (URLs or base64) |
| `remove_images_from_post` | Remove all images from a post |

### Publishing

| Tool | Use when |
|------|----------|
| `schedule_post` | Schedule for future (timezone + platforms) |
| `unschedule_post` | Move scheduled post back to draft |
| `publish_post` | Publish now (requires user confirmation) |

---

## Common workflows

### A. Browse or search public templates

```
get_template_categories()                    → carousel, quote, LinkedIn, etc.
search_templates(category="carousel")        → browse a category
search_templates(query="motivational")       → keyword search
search_templates(category="quote", query="sale")  → combine both
get_template(template_id)                    → details + editor link
```

### B. MAIN FLOW — route by the copy

```
No template yet?
  AI Design Agent on a new blank. Do not ask unless they are ambiguous.

Has / chose a template ID?
  User already wrote the slide or graphic text → exact copy (below). Do not use the AI maker.
  Topic, blog, YouTube, or TikTok, or they asked the AI to write → AI maker.
  They explicitly asked to recreate the layout → Design Agent override.

── Path A (Design Agent — no template ID/name) ──
get_profiles → create_graphic(profile_id) → get_brand_styles (ASK if 2+ styles; ask Pro if available)
→ run_ai_design_agent(style_id?, model, reference_image if uploaded) → share edit_url (STOP)
→ render_template only if they ask to preview/download

── Path B exact copy (user already wrote the slides or graphic text) ──
get_template → get_template_structure
map their sentences onto labels with no rewording
SHOW the text (slide by slide, or label and value) and WAIT for yes
generate_carousel(carousel_content) OR generate_graphic(content_update)
check_job_status → export_url(s)

── Path B AI copy (topic, blog, YouTube, or TikTok) ──
get_template → get_template_structure
generate_ai_carousel OR generate_ai_graphic (method=topic|blog|youtube|tiktok_reel)
check_job_status → export_url(s)

── Path B Design Agent (only if they explicitly asked to override/recreate) ──
get_brand_styles → run_ai_design_agent(template_id, style_id?, model, reference_image?) → share edit_url

── Path C edit + save (named template, keep layout) ──
get_template → get_template_structure
edit_template(content_update patches; value optional for style-only)
check_job_status → share edit_url (STOP)
```

### C. Exact copy (`carousel_content` / `content_update`)

Use this when the user already wrote the words. Labels/element keys must match `get_template_structure`. Copy each `value` character-for-character. **Show that text and wait for a yes before calling the tool.** **Do not use the legacy `carousel` key.** Do not call `generate_ai_*`.

- Carousel → `generate_carousel` with `carousel_content`. Full example: [examples/carousel_content.json](examples/carousel_content.json)
- Graphic → `generate_graphic` with `content_update`. Full example: [examples/content_update.json](examples/content_update.json)
- Format notes: [examples.md](examples.md)

Carousel elements use `{ "type": "text"|"image", "value": "..." }`. Graphic items use `{ "type": "textbox"|"image"|"shape", "label": "...", ... }`.

### D. Generate → post → schedule/publish (platforms explicit)

```
check_job_status → export_urls
create_post(caption, profile_id) → uuid
set_post_images(uuid, export_urls)
get_social_accounts(profile_id)
# LinkedIn only:
publish_post(..., linkedin_publish=true, instagram_publish=false)
# Instagram only:
publish_post(..., linkedin_publish=false, instagram_publish=true)
Ask: "Publish to LinkedIn only?" / "Publish to Instagram only?" — name platforms
```

---

## Example user prompts

- "Create a 3-slide carousel on '3 ways to grow beard'" → **ask** Design Agent vs choose template
- "Make a LinkedIn post about remote work" → **ask** Design Agent vs choose template; publish LinkedIn only
- "Make an Instagram post about 'why remote work is great'" → **ask** Design Agent vs choose template; Instagram only
- "Turn this YouTube into a carousel: [URL]" → **ask** Design Agent vs choose template
- "Fit this blog into a carousel: [URL]" → **ask** Design Agent vs choose template
- "Use template 5821. Slide 1: … Slide 2: …" → structure → show the text → wait for yes → `generate_carousel`
- "Put this exact headline and subheadline on template 5821" → structure → show the fields → wait for yes → `generate_graphic`
- "I like this template but new topic X" → `get_template_structure` → `generate_ai_*` (AI writes the copy)
- "Use template 5821 + this YouTube" → structure → `generate_ai_carousel`
- "Publish that post to LinkedIn only" → `linkedin_publish=true`, `instagram_publish=false`
- "Publish that post to Instagram only" → `linkedin_publish=false`, `instagram_publish=true`
- "Make the headings a bit bigger on template 5821" → structure → `edit_template` with fontSize ≈ current * 1.15
- "Change the hero image on this design to https://…" → structure → `edit_template` image patch
- "Make the headline text #1A1A1A" → structure → `edit_template` fontColor patch
- "Show me my designs" / "Show me carousel templates"
- "Get details of template 149900"

---

## Reference

- Manual JSON examples: [examples.md](examples.md), [examples/carousel_content.json](examples/carousel_content.json), [examples/content_update.json](examples/content_update.json)
- Full setup guide for Claude, Cursor, and other MCP clients: `CONTENTDRIPS_MCP_OVERVIEW.md` in the contentdrips-mcp repo.
