---
name: create-design
description: >-
  Design a new Contentdrips graphic or carousel in the user's brand style
  when they did not name a template. Use for quote cards, ads, infographics,
  LinkedIn/Instagram/TikTok-sized posts, or "recreate this" from an uploaded image.
---

# Create a design

Use this when there is **no** template ID or name. Contentdrips builds a new layout and applies a saved brand style.

## Steps

1. `get_profiles` — ask which workspace if there are two or more. Pass `profile_id`.
2. `create_graphic` — set `type` (`carousel`, `graphic`, `quote`) and `format`:
   - `square` 1080×1080
   - `portrait` 1080×1350
   - `tiktok` 1080×1920
   - `landscape` 1920×1080
   - `custom` + `width` + `height` (100–3000)
   For carousels, set `slides` when the user names a count.
3. `get_brand_styles` — if two or more styles, ask which. If one, use it unless they decline. If Pro is available, ask Basic vs Pro (default Basic). Pass `style_id` and `model`.
4. `run_ai_design_agent` — if they uploaded a reference image, pass `reference_image` (https URL or data URI).
5. Share `edit_url` and **stop**. Do not call `render_template` unless they ask to preview, download, attach, or publish.

Use Design Agent on an **existing** template only if they explicitly ask to override or recreate that canvas.
