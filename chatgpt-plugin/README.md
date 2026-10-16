# ContentDrips ChatGPT plugin

Zip this folder and upload it at [ChatGPT Plugins](https://chatgpt.com/plugins) → **Upload new or existing plugin**.

Package format follows [Package your plugin](https://developers.openai.com/plugins/build/plugins) and [plugin guidelines](https://developers.openai.com/plugins/plugin-guidelines).

Skills are included so ChatGPT picks the right workflow (new design vs fill a template vs publish). The hosted MCP server still provides the tools; skills do not replace it.

## Zip (plugin.json must be at the archive root)

From the repo root:

```bash
cd chatgpt-plugin
zip -r ../contentdrips-chatgpt-plugin.zip . -x "*.DS_Store" -x "**/.DS_Store"
```

Upload `contentdrips-chatgpt-plugin.zip`. Do not nest an extra parent folder inside the zip.

## After upload

1. Open **Metadata & Skills** and fix any package findings.
2. Open **MCPs** → connect `https://mcp.contentdrips.com/mcp` (OAuth). Complete domain verification if asked.
3. Enter reviewer credentials in **Review details** (not in this zip). Use a populated test account with no MFA.
4. Demo recording is already in `plugin.json` (`https://youtu.be/WH8pZa8Cov8`).
5. Submit for review.

This zip has no API keys or secrets. Auth happens when ChatGPT connects the hosted MCP server.
