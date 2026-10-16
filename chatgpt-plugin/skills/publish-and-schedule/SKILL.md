---
name: publish-and-schedule
description: >-
  Draft, attach images, schedule, or publish Contentdrips posts to LinkedIn
  and/or Instagram. Use when the user wants a caption, calendar, or to post
  now. Confirm before publishing or deleting.
---

# Publish and schedule

This plugin publishes to **LinkedIn** and **Instagram** only. If they ask for Facebook, X, or TikTok publish, say those destinations are not available here and offer LinkedIn and/or Instagram, or a download.

Connect accounts: `https://app.contentdrips.com/social-accounts`  
Post editor: `https://app.contentdrips.com/make-post?id={POST_UUID}`

## Steps

1. `get_profiles` — pass `profile_id`.
2. `get_social_accounts` — if the named platform is missing, send them to the connect URL. Do not substitute another network.
3. `create_post` with caption (and `profile_id`).
4. Attach images:
   - Contentdrips exports → `set_post_images` with `export_urls` from `check_job_status`
   - External URLs → `upload_images_to_post`
5. Confirm platforms, then:
   - Later → `schedule_post` with timezone and explicit `linkedin_publish` / `instagram_publish`
   - Now → `publish_post` only after they confirm

Platform flags (always both):

- LinkedIn only → `linkedin_publish=true`, `instagram_publish=false`
- Instagram only → the opposite
- Both, only if they named both

Confirm before `delete_post`. Use `list_posts` / `get_post` to show drafts, scheduled, or published items.
