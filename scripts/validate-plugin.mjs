import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];

function readJson(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) {
    errors.push(`missing ${rel}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    errors.push(`${rel} is not valid JSON: ${err.message}`);
    return null;
  }
}

const plugin = readJson(".cursor-plugin/plugin.json");
const mcp = readJson("mcp.json");
const grokMcp = readJson(".mcp.json");

if (plugin) {
  if (!/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(plugin.name || "")) {
    errors.push("plugin name must be lowercase kebab-case");
  }
  if (!plugin.description) errors.push("plugin description is required");
  if (!plugin.version) errors.push("plugin version is required");
  if (!plugin.author?.name) errors.push("plugin author.name is required");
  if (plugin.license !== "MIT") errors.push("plugin license should be MIT");
  if (plugin.logo && !existsSync(resolve(root, plugin.logo))) {
    errors.push(`logo not found: ${plugin.logo}`);
  }
  const vars = plugin.variables?.properties || {};
  if (!vars.CONTENTDRIPS_API_KEY) {
    errors.push("variables.CONTENTDRIPS_API_KEY is required");
  }
}

if (!existsSync(resolve(root, "LICENSE"))) errors.push("missing LICENSE");
if (!existsSync(resolve(root, "skills/contentdrips/SKILL.md"))) {
  errors.push("missing skills/contentdrips/SKILL.md");
}

if (mcp && !mcp.mcpServers?.contentdrips?.url) {
  errors.push("mcp.json must define contentdrips.url");
}
if (mcp?.mcpServers?.contentdrips?.headers?.Authorization !== "Bearer ${CONTENTDRIPS_API_KEY}") {
  errors.push("mcp.json must use Bearer ${CONTENTDRIPS_API_KEY}");
}
if (JSON.stringify(mcp) !== JSON.stringify(grokMcp)) {
  errors.push("mcp.json and .mcp.json must be identical");
}

if (errors.length) {
  console.error("Plugin validation failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("Plugin validation passed.");
