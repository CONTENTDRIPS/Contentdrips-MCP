---
name: get-started
description: >-
  Start a Contentdrips social design or publishing task. Use when the user
  wants graphics, carousels, captions, or scheduled LinkedIn/Instagram posts
  and you need to pick the right workflow.
---

# Get started with Contentdrips

Contentdrips designs social graphics and carousels in the user's brand style, then can draft, schedule, or publish to **LinkedIn** and **Instagram**. TikTok is a canvas size and a source URL (reel → carousel/graphic), not a publish destination in this plugin.

Editor: `https://app.contentdrips.com/canvas?template={TEMPLATE_ID}`  
Post: `https://app.contentdrips.com/make-post?id={POST_UUID}`  
Connect accounts: `https://app.contentdrips.com/social-accounts`

Always share the editor link after creating or editing a design.

## Pick a workflow

Call `get_profiles` first. If there are two or more workspaces, ask which. Pass `profile_id` on later tools.

| User intent | Skill / path |
|---|---|
| New design, no template named | [create-design](../create-design/SKILL.md) |
| Named template + their own slide or graphic text | [fill-from-source](../fill-from-source/SKILL.md) — show the text and wait for yes, then `generate_carousel` or `generate_graphic` |
| Named template + topic, blog, YouTube, or TikTok URL | [fill-from-source](../fill-from-source/SKILL.md) — `generate_ai_carousel` or `generate_ai_graphic` |
| Caption, schedule, or publish | [publish-and-schedule](../publish-and-schedule/SKILL.md) |
| Small tweak on a named design (font, color, image, text) | `get_template_structure` → `edit_template` → share `edit_url` |

Browse (`get_my_templates`, `search_templates`) only when they ask to show, find, or pick a design.

Confirm before `publish_post`, `delete_graphic`, or `delete_post`. Do not render after a new design unless they ask to preview, download, attach, or publish.
