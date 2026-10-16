---
name: fill-from-source
description: >-
  Fill an existing Contentdrips template while keeping the layout. If the user
  already wrote the slide or graphic text, place it exactly and confirm before
  filling. If they gave a topic, blog, YouTube, or TikTok URL, let Contentdrips
  write the copy. Use when the user names a template or pastes a template ID.
---

# Fill a template from a source

Use this when the user **named a template** (or pasted an ID) and wants new copy in that layout.

## Pick the path

| What they gave | Tool |
|---|---|
| The actual slide text, or the full graphic copy | `generate_carousel` or `generate_graphic` |
| A topic, blog, YouTube, or TikTok URL, or "write the slides" | `generate_ai_carousel` or `generate_ai_graphic` |

Do not call `generate_ai_*` when they already wrote the words. Those tools rewrite the copy.

## Exact copy

1. `get_profiles` — pass `profile_id` on generate tools.
2. `get_template` — resolve by ID or name.
3. `get_template_structure` — map their sentences onto the labels. Copy each value character-for-character.
4. Show that text in chat before any fill tool: each slide's heading and body, or each graphic label and its value. Not a raw JSON dump.
5. Ask them to confirm. Do not call the fill tool until they say yes. If they correct a line, show the update and ask again.
6. On yes, carousel → `generate_carousel` (`carousel_content`). Graphic, quote, or infographic → `generate_graphic` (`content_update`). Pass only the confirmed text. See [examples.md](examples.md).
7. `check_job_status` until complete. Share export URLs and the editor link.

## AI-written copy

1. `get_profiles`, `get_template`, `get_template_structure`.
2. Carousel → `generate_ai_carousel`. Graphic, quote, or infographic → `generate_ai_graphic`.
   `method`: `topic` | `blog` | `youtube` | `tiktok_reel`.
3. `check_job_status` until complete. Share export URLs and the editor link.

Do not auto-publish. Do not switch to Design Agent unless they asked to recreate the layout.

## Small edits (save in place)

Named template + "make headings bigger", change a color, image URL, or line of text → `edit_template` patches (not Design Agent). Share `edit_url`. Relative size: a bit bigger ≈ current `fontSize` × 1.15.
