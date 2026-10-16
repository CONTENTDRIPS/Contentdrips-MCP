# Directory listing pack

Materials for Cursor Marketplace, Grok Bot (same Cursor listing), and the Claude Connectors Directory. ChatGPT is already under review — do not change the scanned tool contract until that review finishes.

## Shared listing

| Field | Value |
| --- | --- |
| Name | ContentDrips |
| Tagline (≤55) | Branded carousels and social posts from chat |
| Slug | `contentdrips` |
| MCP URL | `https://mcp.contentdrips.com/mcp` |
| Transport | Streamable HTTP |
| Homepage | https://contentdrips.com/mcp/ |
| Docs | https://contentdrips.com/mcp/ |
| Privacy policy | https://contentdrips.com/privacy/ |
| Terms | https://contentdrips.com/tos/ |
| Support | support@contentdrips.com |
| Privacy contact | privacy@contentdrips.com |
| Company | Contentdrips SMC Pvt Ltd. |
| Website | https://contentdrips.com |
| Icon | [assets/logo.svg](assets/logo.svg) |
| Public repo | https://github.com/CONTENTDRIPS/Contentdrips-MCP |

**Description (≤2000):** ContentDrips is a branded design and social publishing connector. From chat, create LinkedIn and Instagram carousels or single-image graphics in a saved brand style, fill an existing template from a topic or URL, and draft, schedule, or publish only to the platforms the user names. This is a design workflow (templates, brand kits, editor links, social posts) — not standalone image generation.

**Categories:** Design, Social media, Marketing, Productivity

**Reads / writes:** Both. Read tools list templates, brand styles, workspaces, and posts. Write tools create designs, start render jobs, and manage or publish posts.

**Prerequisites:** A ContentDrips account, an API token from Settings → API Tokens, and (for publish) LinkedIn and/or Instagram connected at https://app.contentdrips.com/social-accounts.

**Allowed link URIs:** `https://app.contentdrips.com`, `https://contentdrips.com`, `https://developer.contentdrips.com`

## Cursor / Grok Bot

1. Repo is public: https://github.com/CONTENTDRIPS/Contentdrips-MCP
2. Plugin manifest: `.cursor-plugin/plugin.json`
3. MCP config: `mcp.json` (Grok Build copy: `.mcp.json`, identical)
4. License: MIT
5. Submit at https://cursor.com/marketplace/publish — repository URL `https://github.com/CONTENTDRIPS/Contentdrips-MCP`.
6. Grok Bot uses the same Cursor Marketplace listing. Do not PR `xai-org/plugin-marketplace` for Grok Bot.
7. After this commit is on `main`, the public repo matches the plugin checklist (manifest, `mcp.json`, MIT license, committed logo, README).

Local test: symlink this repo to `~/.cursor/plugins/local/contentdrips`, reload Cursor, set `CONTENTDRIPS_API_KEY`.

## Claude Connectors Directory

Submit from a **Team or Enterprise** Claude.ai org (Owner, or Directory/Libraries role). Individual plans have no portal.

Portal answers:

- Connection: Universal URL `https://mcp.contentdrips.com/mcp`, streamable HTTP
- Auth: OAuth + Dynamic Client Registration (`oauth_dcr`)
- Use cases: Design a carousel in a saved brand style; fill a template from a blog/YouTube URL; schedule a LinkedIn or Instagram post
- Data handling: First-party ContentDrips APIs (`api.contentdrips.com`, `generate.contentdrips.com`). Domain matches the service. No health data. Not sponsored content.
- Frame as a **design + social publishing** tool (templates, brand styles, carousels, editor links). Do not describe it as standalone AI image generation.
- Test account: a populated ContentDrips user with at least one workspace, one brand style, one saved design, and a connected social account if publish tools are in scope. No MFA on the reviewer login.
- Test every tool in MCP Inspector and as a custom Claude connector before submit.

Example prompts:

1. Create a 5-slide LinkedIn carousel on "how to price freelance work" in my brand style. Do not publish — give me the editor link.
2. Show my saved designs and open template 5821.
3. List my scheduled posts.

## ChatGPT

Already submitted before this pass. Server-only OAuth/auth plumbing is safe. Adding a human `title` on every tool is a scanned-metadata change: if review is still open, rescan or expect a resubmit. Do not change tool names, descriptions, schemas, or server `instructions` unless OpenAI asks.

## Test account (Claude reviewers)

Use a fully populated ContentDrips account with no MFA:

- At least one workspace (`get_profiles`)
- At least one saved brand style (`get_brand_styles`)
- At least one saved design (`get_my_templates`)
- Optional: a LinkedIn or Instagram account at https://app.contentdrips.com/social-accounts for publish tools

Submit from Claude.ai → organization settings → Connectors Directory (Team or Enterprise Owner).
