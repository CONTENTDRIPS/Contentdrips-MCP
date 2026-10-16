---
name: fill-from-source
description: >-
  Fill an existing Contentdrips template from a topic, blog, YouTube video, or
  TikTok/Reel URL while keeping the layout. Use when the user names a template
  or pastes a template ID.
---

# Fill a template from a source

Use this when the user **named a template** (or pasted an ID) and wants new copy or media in that layout.

## Steps

1. `get_profiles` — pass `profile_id` on generate tools.
2. `get_template` — resolve by ID or name.
3. `get_template_structure` — required before generate or edit.
4. Carousel type → `generate_ai_carousel`. Graphic, quote, or infographic → `generate_ai_graphic`.
   `method`: `topic` | `blog` | `youtube` | `tiktok_reel`.
5. `check_job_status` until complete. Share export URLs and the editor link.

Do not auto-publish. Do not switch to Design Agent unless they asked to recreate the layout.

## Manual field control

If they want every field set by hand, pass `carousel_content` to `generate_carousel` or `content_update` to `generate_graphic` after `get_template_structure`. See [examples.md](examples.md).

## Small edits (save in place)

Named template + "make headings bigger", change a color, image URL, or line of text → `edit_template` patches (not Design Agent). Share `edit_url`. Relative size: a bit bigger ≈ current `fontSize` × 1.15.
