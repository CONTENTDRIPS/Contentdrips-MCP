---
name: create-design
description: >-
  Design a new Contentdrips graphic or carousel in the user's brand style,
  or edit an existing canvas (rounded, color, icon, restyle). Use for quote
  cards, ads, infographics, LinkedIn/Instagram/TikTok-sized posts, or
  "recreate this" from an uploaded image.
---

# Create a design

Use this when there is **no** template ID or name (new layout), or when they want a **canvas/visual edit** on a named template.

## Steps

For a **canvas edit** on a named template, skip step 2 — reuse that `template_id`.

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

On an **existing** template: reuse that `template_id` with `run_ai_design_agent` for canvas edits (rounded, bigger title, color, icon, restyle) or to override/recreate the layout. Do not call `create_graphic` again. Pass `conversation_history` on follow-ups.
