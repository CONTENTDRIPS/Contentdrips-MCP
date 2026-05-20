import { createMcpHandler } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LaravelClient } from "./lib/laravel-client";
import { RendererClient } from "./lib/renderer-client";

interface Env {
  LARAVEL_API_URL: string;
  RENDERER_API_URL: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Fetch a URL and return it as a base64 string (for inline image content). */
async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const data = btoa(binary);
    const ct = res.headers.get("content-type") || "";
    const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : (url.endsWith(".webp") ? "image/webp" : "image/jpeg");
    return { data, mimeType };
  } catch {
    return null;
  }
}

/** Format a date string as "May 20, 2026" */
function fmtDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return dateStr;
  }
}

/**
 * Build rich content for a template list — one text row + one inline image per template.
 * Returns an interleaved array: [header_text, image?, row_text, image?, ...]
 */
async function buildTemplateContent(templates: any[], total: number): Promise<any[]> {
  const content: any[] = [];

  content.push({
    type: "text" as const,
    text: `Found ${total} template${total !== 1 ? "s" : ""}:\n`,
  });

  // Fetch all thumbnails in parallel (max 20)
  const thumbJobs = templates.slice(0, 20).map((t) =>
    t.thumbnail ? fetchAsBase64(t.thumbnail) : Promise.resolve(null)
  );
  const thumbs = await Promise.all(thumbJobs);

  for (let i = 0; i < templates.length; i++) {
    const t = templates[i];
    const row =
      `**${t.name}**\n` +
      `  ID: \`${t.id}\`  |  Type: ${t.type}  |  Size: ${t.width}×${t.height}` +
      (t.updated_at ? `  |  Last Edited: ${fmtDate(t.updated_at)}` : "") +
      (t.thumbnail ? `\n  Thumbnail: ${t.thumbnail}` : "");

    content.push({ type: "text" as const, text: row });

    const thumb = thumbs[i];
    if (thumb) {
      content.push({ type: "image" as const, data: thumb.data, mimeType: thumb.mimeType });
    }
  }

  return content;
}

/**
 * Creates a fresh, stateless MCP server per request with the user's token
 * bound as a closure. No Durable Objects required.
 */
export function createContentDripsMcpHandler(apiToken: string, env: Env) {
  const server = new McpServer({ name: "ContentDrips MCP", version: "1.0.0" });
  const laravel = new LaravelClient(env.LARAVEL_API_URL);
  const renderer = new RendererClient(env.RENDERER_API_URL);

  // Tool 1: Search Templates
  server.registerTool(
    "search_templates",
    {
      description: "Search for ContentDrips templates by keyword. Returns template list with thumbnails and last-edited date.",
      inputSchema: {
        query: z.string().describe("Search keyword (e.g. 'carousel', 'quote', 'linkedin')"),
        type: z.string().optional().describe("Filter by type: 'carousel', 'quote', 'quote_new', etc."),
      },
    },
    async ({ query, type }) => {
      try {
        const result = await laravel.searchTemplates(query, type, apiToken);
        const templates = result.templates || [];
        const content = await buildTemplateContent(templates, result.count ?? templates.length);
        return { content };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 2: Get My Templates
  server.registerTool(
    "get_my_templates",
    {
      description: "Get templates saved in your ContentDrips account. Returns template list with thumbnails and last-edited date.",
      inputSchema: {
        type: z.string().optional().describe("Filter by type: 'carousel', 'quote', etc."),
      },
    },
    async ({ type }) => {
      try {
        const result = await laravel.getMyTemplates(type, apiToken);
        const templates = result.templates || [];
        const content = await buildTemplateContent(templates, result.count ?? templates.length);
        return { content };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 3: Get Template Structure
  server.registerTool(
    "get_template_structure",
    {
      description: "Inspect a template's field structure (use before generating to understand what fields exist)",
      inputSchema: {
        template_id: z.string().describe("The template ID to inspect"),
      },
    },
    async ({ template_id }) => {
      try {
        const result = await laravel.getTemplateStructure(template_id, apiToken);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 4: Generate AI Carousel
  server.registerTool(
    "generate_ai_carousel",
    {
      description: "Generate a carousel using AI from a topic, blog, YouTube, or TikTok/Reel URL",
      inputSchema: {
        template_id: z.string().describe("Carousel template ID"),
        method: z.enum(["topic", "blog", "youtube", "tiktok_reel"]).describe(
          "'topic' = free text idea | 'blog' = blog URL | 'youtube' = YouTube URL | 'tiktok_reel' = TikTok/Reel URL"
        ),
        input: z.string().describe("Your topic text or the content URL"),
        profile_id: z.string().describe("Your ContentDrips profile ID"),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format (default: png)"),
      },
    },
    async ({ template_id, method, input, profile_id, output }) => {
      try {
        const result = await renderer.generateAiCarousel({
          template_id, method, input, output, profile_id, api_key: apiToken,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 5: Generate AI Graphic
  server.registerTool(
    "generate_ai_graphic",
    {
      description: "Generate a non-carousel graphic using AI from a topic, blog, YouTube, or TikTok/Reel URL",
      inputSchema: {
        template_id: z.string().describe("Graphic template ID (non-carousel only)"),
        method: z.enum(["topic", "blog", "youtube", "tiktok_reel"]).describe(
          "'topic' = free text idea | 'blog' = blog URL | 'youtube' = YouTube URL | 'tiktok_reel' = TikTok/Reel URL"
        ),
        input: z.string().describe("Your topic text or the content URL"),
        profile_id: z.string().describe("Your ContentDrips profile ID"),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format (default: png)"),
      },
    },
    async ({ template_id, method, input, profile_id, output }) => {
      try {
        const result = await renderer.generateAiGraphic({
          template_id, method, input, output, profile_id, api_key: apiToken,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 6: Generate Carousel (custom JSON)
  server.registerTool(
    "generate_carousel",
    {
      description: "Generate a carousel from a custom JSON structure. Call get_template_structure first if unsure of the format.",
      inputSchema: {
        template_id: z.string().describe("Carousel template ID"),
        carousel: z.any().describe("Carousel JSON: { intro_slide, slides: [...], ending_slide }"),
        profile_id: z.string().describe("Your ContentDrips profile ID"),
        branding: z.any().optional().describe("Branding: { name, bio, handle, website_url, avatar_image_url }"),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format"),
      },
    },
    async ({ template_id, carousel, profile_id, branding, output }) => {
      try {
        const result = await renderer.generateCarousel({
          template_id, carousel, branding, output, profile_id, api_key: apiToken,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 7: Generate Graphic (custom content_update)
  server.registerTool(
    "generate_graphic",
    {
      description: "Generate a non-carousel graphic from a content_update array. Call get_template_structure first to get field labels.",
      inputSchema: {
        template_id: z.string().describe("Graphic template ID"),
        content_update: z.array(z.any()).describe(
          "Array of updates: [{ type: 'textbox'|'image', label: '...', value: '...' }]"
        ),
        profile_id: z.string().describe("Your ContentDrips profile ID"),
        branding: z.any().optional().describe("Optional branding object"),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format"),
      },
    },
    async ({ template_id, content_update, profile_id, branding, output }) => {
      try {
        const result = await renderer.generateGraphic({
          template_id, content_update, branding, output, profile_id, api_key: apiToken,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 8: Check Job Status
  server.registerTool(
    "check_job_status",
    {
      description: "Check the status of an async generation job and get the output URL when ready",
      inputSchema: {
        job_id: z.string().describe("Job ID returned from any generate tool"),
      },
    },
    async ({ job_id }) => {
      try {
        const result = await renderer.checkJobStatus(job_id, apiToken);
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  return createMcpHandler(server, { route: "/mcp" });
}
