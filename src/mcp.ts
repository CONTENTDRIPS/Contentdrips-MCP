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

/** Fetch a single image URL and return base64 for MCP inline image content. */
async function fetchAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const data = btoa(binary);
    const ct = res.headers.get("content-type") || "";
    const mimeType = ct.startsWith("image/")
      ? ct.split(";")[0]
      : url.endsWith(".webp")
        ? "image/webp"
        : "image/jpeg";
    return { data, mimeType };
  } catch {
    return null;
  }
}

/** Build a valid MCP tool-result image content block. */
function buildMcpImageContent(data: string, mimeType: string) {
  return { type: "image" as const, data, mimeType };
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

/** Build editor URL for a template/design. */
function templateEditUrl(id: number | string, editUrl?: string): string {
  return editUrl || `https://app.contentdrips.com/canvas?template=${id}`;
}

/** Escape pipe characters for markdown table cells. */
function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

/** Build a markdown table for a list of templates/designs. */
function buildTemplateTableMarkdown(
  templates: any[],
  total: number,
  options?: { title?: string; emptyMessage?: string }
): string {
  if (templates.length === 0) {
    return options?.emptyMessage ?? "No templates found. Try a different keyword or category.";
  }

  const slice = templates.slice(0, 20);
  const lines = [
    options?.title ?? `Found **${total}** design${total !== 1 ? "s" : ""}:`,
    "",
    "| Name | ID | Type | Size | Updated | Open |",
    "| --- | --- | --- | --- | --- | --- |",
  ];

  for (const t of slice) {
    const editUrl = templateEditUrl(t.id, t.edit_url);
    const updated = t.updated_at ? fmtDate(t.updated_at) : "—";
    lines.push(
      `| ${mdCell(t.name || "Untitled")} | \`${t.id}\` | ${t.type || "—"} | ${t.width}×${t.height} | ${updated} | [Open in editor](${editUrl}) |`
    );
  }

  if (templates.length > 20) {
    lines.push("", `_Showing first 20 of ${total}. Refine your search to see more._`);
  }

  return lines.join("\n");
}

/** Build a single markdown table of all template categories. */
function buildCategoriesMarkdown(data: {
  type_categories?: any[];
  db_categories?: any[];
}): string {
  const categories = [
    ...(data.type_categories || []).map((cat) => ({
      label: cat.label || cat.slug,
      template_count: cat.template_count,
      search_category: cat.search_category || cat.slug,
    })),
    ...(data.db_categories || []).map((cat) => ({
      label: cat.name,
      template_count: cat.template_count,
      search_category: cat.search_category || cat.name,
    })),
  ].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  if (categories.length === 0) {
    return "No template categories found.";
  }

  const lines = [
    "## ContentDrips Template Categories",
    "",
    "| Category | Templates | Search with |",
    "| --- | ---: | --- |",
  ];

  for (const cat of categories) {
    lines.push(
      `| ${mdCell(cat.label)} | ${cat.template_count ?? "—"} | \`category="${cat.search_category}"\` |`
    );
  }

  return lines.join("\n");
}

/**
 * Build markdown table content for a template list.
 */
function buildTemplateContent(
  templates: any[],
  total: number,
  options?: { title?: string; emptyMessage?: string }
): { type: "text"; text: string }[] {
  return [{ type: "text" as const, text: buildTemplateTableMarkdown(templates, total, options) }];
}

/**
 * Creates a fresh, stateless MCP server per request with the user's token
 * bound as a closure. No Durable Objects required.
 */
export function createContentDripsMcpHandler(apiToken: string, env: Env) {
  const server = new McpServer({ name: "ContentDrips MCP", version: "1.0.0" });
  const laravel = new LaravelClient(env.LARAVEL_API_URL);
  const renderer = new RendererClient(env.RENDERER_API_URL);

  // Tool 1a: List template categories
  server.registerTool(
    "get_template_categories",
    {
      description:
        "List available ContentDrips template categories (carousel, quote, LinkedIn, motivational, etc.). " +
        "Use when the user asks 'what template categories do you have', 'show me carousel templates', " +
        "'quote templates', or any category of designs. Then call search_templates with the matching category.",
      inputSchema: {},
    },
    async () => {
      try {
        const result = await laravel.getTemplateCategories(apiToken);
        return { content: [{ type: "text" as const, text: buildCategoriesMarkdown(result) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 1b: Search public templates
  server.registerTool(
    "search_templates",
    {
      description:
        "Browse or search public ContentDrips templates (designs, graphics, creatives, carousels, quote cards). " +
        "Use when the user asks to 'show me some carousel templates', 'quote templates', 'LinkedIn designs', " +
        "'find motivational templates', or search by keyword. " +
        "For category browsing, pass category (e.g. 'carousel', 'quote', or a topic category name). " +
        "Call get_template_categories first if you are unsure which categories exist. " +
        "Returns a markdown table with an Open in editor link for each template.",
      inputSchema: {
        query: z.string().optional().describe("Optional keyword search (e.g. 'motivational', 'linkedin', 'sale')"),
        category: z.string().optional().describe(
          "Category filter — built-in type slug (carousel, quote, tweet_style, placard, evergreen, libanners) " +
          "or dynamic topic category name from get_template_categories"
        ),
        type: z.string().optional().describe("Deprecated alias for category — prefer category instead"),
      },
    },
    async ({ query, category, type }) => {
      try {
        const result = await laravel.searchTemplates(query, {
          category: category || type,
          apiKey: apiToken,
        });
        const templates = result.templates || [];
        const filterLabel = result.category ? ` in **${result.category}**` : "";
        const queryLabel = result.query ? ` matching **${result.query}**` : "";
        const content = buildTemplateContent(templates, result.count ?? templates.length, {
          title: `Found **${result.count ?? templates.length}** public template${(result.count ?? templates.length) !== 1 ? "s" : ""}${filterLabel}${queryLabel}:`,
          emptyMessage: "No public templates found. Try get_template_categories for available categories, or a different keyword.",
        });
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
      description:
        "Get the user's own saved templates/designs/graphics/carousels from their ContentDrips account. " +
        "Use when the user says 'show me my designs', 'my templates', 'my graphics', 'list my creatives', " +
        "'what templates do I have', etc. Returns a markdown table with an Open in editor link for each design. " +
        "Optionally filter by type or by profile/workspace using profile_id.",
      inputSchema: {
        type: z.string().optional().describe("Optional type filter: 'carousel', 'quote', 'graphic', etc."),
        profile_id: z.string().optional().describe("Optional profile/workspace ID to filter designs by a specific workspace"),
      },
    },
    async ({ type, profile_id }) => {
      try {
        const result = await laravel.getMyTemplates(type, apiToken, profile_id);
        const templates = result.templates || [];
        const content = buildTemplateContent(templates, result.count ?? templates.length, {
          title: `Your designs (**${result.count ?? templates.length}**):`,
          emptyMessage: "You don't have any saved designs yet. Use create_graphic to make a new blank design.",
        });
        return { content };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 2b: Get a single template/design by ID or name
  server.registerTool(
    "get_template",
    {
      description:
        "Look up a single template (design, graphic, carousel) by its ID or name, show a thumbnail preview, and provide an editor link. " +
        "Use when the user asks: 'show me template 163191', 'open my FB Ad Creative v1', " +
        "'what does my Instagram Post design look like', etc. " +
        "Searches the user's own templates first, then public ContentDrips templates.",
      inputSchema: {
        template_id: z.string().optional().describe("Numeric template ID (e.g. '163191')"),
        template_name: z.string().optional().describe("Template name or partial name (e.g. 'FB Ad Creative v1')"),
      },
    },
    async ({ template_id, template_name }) => {
      if (!template_id && !template_name) {
        return { content: [{ type: "text" as const, text: "Please provide a template ID or name." }] };
      }
      try {
        const result = await laravel.findTemplate(
          { id: template_id, name: template_name },
          apiToken
        );
        const t = result.template;
        if (!t) {
          return { content: [{ type: "text" as const, text: "Template not found." }] };
        }

        const editUrl = templateEditUrl(t.id, t.edit_url);
        const meta = [
          `ID: \`${t.id}\``,
          `Type: ${t.type}`,
          `Size: ${t.width}×${t.height}`,
          t.updated_at ? `Last edited: ${fmtDate(t.updated_at)}` : null,
        ].filter(Boolean).join("  |  ");

        const content: Array<
          { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
        > = [
          {
            type: "text" as const,
            text: `**${t.name}**\n${meta}\n\n**[Open in editor](${editUrl})**`,
          },
        ];

        if (t.thumbnail) {
          const thumb = await fetchAsBase64(t.thumbnail);
          if (thumb) {
            content.unshift(buildMcpImageContent(thumb.data, thumb.mimeType));
          }
        }

        return { content };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 2d: Create a new blank design/graphic/carousel
  server.registerTool(
    "create_graphic",
    {
      description:
        "Create a new blank design (graphic, carousel, quote) in the user's ContentDrips account. " +
        "Use this when the user says 'create a new design', 'make a new carousel', 'new template', etc. " +
        "Ask the user: 1) a name for the design, 2) carousel or single graphic, " +
        "3) format/dimensions if not specified. The design is created blank and ready to edit at the returned URL. " +
        "Custom pixel sizes ARE supported (100–3000 px): when the user gives exact dimensions like 1200×1200, " +
        "set format to 'custom' and pass width + height — do NOT fall back to a preset.",
      inputSchema: {
        name: z.string().describe("Name for the new design (e.g. 'Q2 LinkedIn Campaign')"),
        type: z.enum(["carousel", "graphic", "quote", "quote_new"]).describe(
          "Design type: 'carousel' = multi-slide, 'graphic' = single image, 'quote' = quote card"
        ),
        format: z.enum(["square", "portrait", "tiktok", "landscape", "custom"]).optional().describe(
          "Preset dimensions — square: 1080×1080 | portrait: 1080×1350 | tiktok: 1080×1920 | landscape: 1920×1080 | custom: any size via width+height (100–3000 px each)"
        ),
        width: z.number().optional().describe("Canvas frame width in px (100–3000). Required with height when format is 'custom' or user specifies exact dimensions."),
        height: z.number().optional().describe("Canvas frame height in px (100–3000). Required with width when format is 'custom' or user specifies exact dimensions."),
        slides: z.number().optional().describe("Number of slides (carousel only, default 3). Each slide is one frame wide."),
        profile_id: z.string().optional().describe("Profile/workspace ID to save the design under (uses default if omitted)"),
      },
    },
    async ({ name, type, format, width, height, slides, profile_id }) => {
      try {
        const resolvedFormat =
          format ?? (width != null && height != null ? "custom" : undefined);
        const result = await laravel.createGraphic(apiToken, {
          name,
          type,
          format: resolvedFormat,
          width,
          height,
          slides,
          profile_id: profile_id ? Number(profile_id) : undefined,
        });
        let text =
          `Design created! ✓\n\n` +
          `**${result.name}**\n` +
          `ID: \`${result.template_id}\`  |  Type: ${result.type}  |  Size: ${result.width}×${result.height}`;
        if (result.slides) text += `  |  Slides: ${result.slides}`;
        text += `\n\n**Open in editor:** ${result.edit_url}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 2d-del: Delete a graphic/design
  server.registerTool(
    "delete_graphic",
    {
      description:
        "Permanently delete a design/graphic/template from the user's ContentDrips account. " +
        "Removes the canvas JSON and thumbnail from S3 and cleans up all related records. " +
        "Ask the user to confirm before calling this — deletion cannot be undone.",
      inputSchema: {
        template_id: z.string().describe("The ID of the design to delete"),
      },
    },
    async ({ template_id }) => {
      try {
        const result = await laravel.deleteGraphic(template_id, apiToken);
        return { content: [{ type: "text" as const, text: `${result.message} (ID: \`${result.deleted_id}\`)` }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 2e: AI Design Agent — generate / edit a design with AI
  server.registerTool(
    "run_ai_design_agent",
    {
      description:
        "Run the AI Design Agent on a template to generate or edit a Fabric.js canvas design. " +
        "Use this when the user wants to: generate a design from a prompt, redesign an existing template, " +
        "or make AI-driven edits to a graphic (e.g. 'change the background to dark blue', 'add a subtitle'). " +
        "The agent writes professional Fabric.js JSON covering typography, layout, colors, and decorative elements. " +
        "For carousels, all slides are designed. The result is saved automatically — share the edit_url with the user to view and edit it.",
      inputSchema: {
        template_id: z.string().describe(
          "The template ID to run the AI agent on. Create one first with create_graphic if needed."
        ),
        prompt: z.string().describe(
          "What to design or change. Be specific: topic, style, colors, content, tone. " +
          "For edits: describe only what to change (e.g. 'change background to dark navy, keep all text')."
        ),
        use_branding: z.boolean().optional().describe(
          "Include the user's profile branding (name, handle, brand colors, fonts) in the design. Default false."
        ),
      },
    },
    async ({ template_id, prompt, use_branding }) => {
      try {
        const result = await laravel.runAIDesignAgent(template_id, apiToken, {
          prompt,
          use_branding,
        });

        const text =
          `AI design complete!\n\n` +
          `**${result.name}** (ID: \`${result.template_id}\`)\n` +
          `${result.summary}\n\n` +
          `**View & edit your design:** ${result.edit_url}`;

        return { content: [{ type: "text" as const, text }] };
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
      description: "Get the final export_url once a rendering job is complete",
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

  // =========================================================================
  // PROFILES & SOCIAL ACCOUNTS TOOLS
  // =========================================================================

  server.registerTool(
    "get_profiles",
    {
      description:
        "Get the user's ContentDrips profiles (workspaces). " +
        "Each profile has its own designs, posts, and social accounts. " +
        "Call this first when the user wants to switch workspace, filter designs by profile, " +
        "or when you need a profile_id for creating posts or designs.",
      inputSchema: {
        _hint: z.string().optional().describe("Ignored — no input required. Pass nothing or omit entirely."),
      },
    },
    async () => {
      try {
        const result = await laravel.getProfiles(apiToken);
        const profiles = result.profiles || [];
        let text = `You have **${profiles.length}** workspace${profiles.length !== 1 ? "s" : ""}:\n\n`;
        for (const p of profiles) {
          const isDefault = p.id === result.default_profile_id;
          text += `**${p.name}**${isDefault ? " *(default)*" : ""}\n  Profile ID: \`${p.id}\`\n\n`;
        }
        text += `To use a specific workspace, mention its Profile ID when creating designs or posts.`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_social_accounts",
    {
      description: "Get connected LinkedIn and Instagram accounts for a profile. Check this before scheduling/publishing posts.",
      inputSchema: {
        profile_id: z.string().describe("Profile ID to check social accounts for"),
      },
    },
    async ({ profile_id }) => {
      try {
        const result = await laravel.getSocialAccounts(profile_id, apiToken);
        let text = "";
        
        if (result.count === 0) {
          text = `No social accounts connected.\n\n**Connect your accounts at:** ${result.connect_url}`;
        } else {
          text = `Connected accounts:\n\n`;
          for (const acc of result.accounts || []) {
            text += `**${acc.name}** (${acc.source})\n`;
            text += `  Account ID: \`${acc.id}\`\n`;
            if (acc.handle) text += `  Handle: @${acc.handle}\n`;
            if (acc.account_type) text += `  Type: ${acc.account_type}\n`;
            text += `\n`;
          }
          text += `LinkedIn connected: ${result.linkedin_connected ? "Yes" : "No"}\n`;
          text += `Instagram connected: ${result.instagram_connected ? "Yes" : "No"}`;
        }
        
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // =========================================================================
  // POSTS TOOLS
  // =========================================================================

  server.registerTool(
    "list_posts",
    {
      description: "List your posts by status (draft, scheduled, published, or all)",
      inputSchema: {
        status: z.enum(["draft", "scheduled", "published", "publishing", "failed", ""]).optional()
          .describe("Filter by status. Leave empty for all posts."),
      },
    },
    async ({ status }) => {
      try {
        const result = await laravel.listPosts(apiToken, status || undefined);
        let text = `Found ${result.count} post(s):\n\n`;
        
        for (const p of result.posts || []) {
          text += `**${p.caption || "(No caption)"}**\n`;
          text += `  UUID: \`${p.uuid}\`  |  Status: ${p.status}\n`;
          if (p.scheduled_time) text += `  Scheduled: ${p.scheduled_time}\n`;
          if (p.image_count > 0) text += `  Images: ${p.image_count}\n`;
          const platforms = [];
          if (p.linkedin_publish) platforms.push("LinkedIn");
          if (p.instagram_publish) platforms.push("Instagram");
          if (platforms.length > 0) text += `  Platforms: ${platforms.join(", ")}\n`;
          text += `\n`;
        }
        
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "get_post",
    {
      description: "Get details of a specific post by UUID",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
      },
    },
    async ({ uuid }) => {
      try {
        const result = await laravel.getPost(uuid, apiToken);
        let text = `**Post details**\n\nUUID: \`${result.uuid}\`\n`;
        if (result.post_url) text += `View/Edit: ${result.post_url}\n`;
        text += `Status: ${result.status}\n`;
        if (result.caption) text += `Caption: ${result.caption}\n`;
        if (result.image_count) text += `Images: ${result.image_count}\n`;
        if (result.scheduled_time) text += `Scheduled: ${result.scheduled_time}\n`;
        if (result.error_log) text += `\nError: ${result.error_log}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "create_post",
    {
      description: "Create a new draft post with a caption and optional images. Use images from export_urls after generating a carousel/graphic.",
      inputSchema: {
        caption: z.string().describe("The post caption/text"),
        profile_id: z.string().optional().describe("Profile ID (uses default if not specified)"),
        images_url: z.array(z.string()).optional().describe("Array of image URLs from export_urls"),
      },
    },
    async ({ caption, profile_id, images_url }) => {
      try {
        const result = await laravel.createPost(apiToken, {
          caption,
          profile_id: profile_id ? parseInt(profile_id) : undefined,
          images_url,
        });
        let text = `Post created!\n\nUUID: \`${result.uuid}\`\n`;
        if (result.post_url) text += `View/Edit: ${result.post_url}\n`;
        text += `\nUse this UUID to attach images, schedule, or publish the post.`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "update_post",
    {
      description: "Update a post's caption or platform settings",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        caption: z.string().optional().describe("New caption"),
        linkedin_publish: z.boolean().optional().describe("Enable LinkedIn publishing"),
        instagram_publish: z.boolean().optional().describe("Enable Instagram publishing"),
      },
    },
    async ({ uuid, caption, linkedin_publish, instagram_publish }) => {
      try {
        const result = await laravel.updatePost(uuid, apiToken, {
          caption,
          linkedin_publish,
          instagram_publish,
        });
        let text = `Post updated!\n\nUUID: \`${result.uuid}\``;
        if (result.post_url) text += `\nView/Edit: ${result.post_url}`;
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "delete_post",
    {
      description: "Delete a post",
      inputSchema: {
        uuid: z.string().describe("The post UUID to delete"),
      },
    },
    async ({ uuid }) => {
      try {
        await laravel.deletePost(uuid, apiToken);
        return { content: [{ type: "text" as const, text: `Post deleted: \`${uuid}\`` }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // ─────────────────────────────────────────────────────────────────────────
  // IMAGE TOOLS
  // ─────────────────────────────────────────────────────────────────────────

  server.registerTool(
    "set_post_images",
    {
      description:
        "CASE 1 — Attach ContentDrips-generated images to a post. " +
        "Use this after generate_ai_carousel, generate_ai_graphic, generate_carousel, or generate_graphic + check_job_status. " +
        "Pass the export_url values exactly as returned (full S3 URLs, full CDN URLs, or relative paths — all are handled). " +
        "The server strips any prefix and stores only the relative path. No re-uploading.",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        export_urls: z.array(z.string()).describe(
          "The export_url value(s) from check_job_status. " +
          "Single image → wrap in array: ['https://...s3.amazonaws.com/server/1/uploads/x.png']. " +
          "Multiple images (carousel) → pass the whole array."
        ),
      },
    },
    async ({ uuid, export_urls }) => {
      try {
        const result = await laravel.setPostImages(uuid, apiToken, export_urls);
        let text = `${result.message}\n\nUUID: \`${result.uuid}\`\n`;
        if (result.images?.length) {
          text += `\nImages:\n` + result.images.map((u: string, i: number) => `  ${i + 1}. ${u}`).join("\n");
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "upload_images_to_post",
    {
      description:
        "CASE 2 — Upload external images to ContentDrips S3 and attach them to a post. " +
        "Use this for ANY image not from ContentDrips: user-uploaded images in the chat, " +
        "Facebook, Instagram, Twitter, or any external URL. " +
        "The server downloads each URL and re-hosts it permanently. " +
        "Supports multiple images at once. " +
        "Prefer image_urls over images_base64 — base64 fails for images larger than ~4 MB.",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        image_urls: z.array(z.string()).optional().describe(
          "Array of publicly accessible image URLs. Each is downloaded server-side and re-uploaded to ContentDrips S3."
        ),
        images_base64: z.array(z.string()).optional().describe(
          "Array of base64-encoded images (with or without data URI prefix). Only for small images < 4 MB each."
        ),
      },
    },
    async ({ uuid, image_urls, images_base64 }) => {
      try {
        const result = await laravel.uploadImagesToPost(uuid, apiToken, { image_urls, images_base64 });
        let text = `${result.message}\n\nUUID: \`${result.uuid}\`\nTotal images on post: ${result.image_count}\n`;
        if (result.new_images?.length) {
          text += `\nUploaded:\n` + result.new_images.map((u: string, i: number) => `  ${i + 1}. ${u}`).join("\n");
        }
        if (result.errors?.length) {
          text += `\n\nWarnings:\n` + result.errors.map((e: string) => `  - ${e}`).join("\n");
        }
        return { content: [{ type: "text" as const, text }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "remove_images_from_post",
    {
      description:
        "Remove ALL images from a post. Each file is deleted from S3, then images_url and graphic_id are cleared. " +
        "Use this when the user wants to replace or discard the visuals on a post.",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
      },
    },
    async ({ uuid }) => {
      try {
        const result = await laravel.removeImagesFromPost(uuid, apiToken, {});
        return { content: [{ type: "text" as const, text:
          `${result.message}\n\nUUID: \`${result.uuid}\`\nFiles deleted from S3: ${result.deleted_count}`
        }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "schedule_post",
    {
      description: "Schedule a post for future publishing to LinkedIn and/or Instagram",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        scheduled_time: z.string().describe("Schedule time in ISO format (e.g. '2024-03-15T09:00:00')"),
        timezone: z.string().describe("User's timezone (e.g. 'America/New_York', 'UTC', 'Europe/London')"),
        linkedin_publish: z.boolean().optional().describe("Publish to LinkedIn (default: false)"),
        instagram_publish: z.boolean().optional().describe("Publish to Instagram (default: false)"),
        linkedin_account_id: z.number().optional().describe("Specific LinkedIn account ID (uses default if not specified)"),
        instagram_account_id: z.number().optional().describe("Specific Instagram account ID (uses default if not specified)"),
      },
    },
    async ({ uuid, scheduled_time, timezone, linkedin_publish, instagram_publish, linkedin_account_id, instagram_account_id }) => {
      try {
        const result = await laravel.schedulePost(uuid, apiToken, {
          scheduled_time,
          timezone,
          linkedin_publish,
          instagram_publish,
          linkedin_account_id,
          instagram_account_id,
        });
        
        const platforms = [];
        if (result.linkedin_publish) platforms.push("LinkedIn");
        if (result.instagram_publish) platforms.push("Instagram");
        
        return { content: [{ type: "text" as const, text: 
          `Post scheduled!\n\n` +
          `UUID: \`${result.uuid}\`\n` +
          `Scheduled time (UTC): ${result.scheduled_time_utc}\n` +
          `Platforms: ${platforms.join(", ")}`
        }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "unschedule_post",
    {
      description: "Unschedule a post and move it back to drafts",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
      },
    },
    async ({ uuid }) => {
      try {
        await laravel.unschedulePost(uuid, apiToken);
        return { content: [{ type: "text" as const, text: `Post unscheduled and moved to drafts: \`${uuid}\`` }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "publish_post",
    {
      description:
        "Publish a post immediately to LinkedIn and/or Instagram. " +
        "IMPORTANT: Before calling this tool you MUST ask the user for explicit confirmation. " +
        "Say something like: 'Are you sure you want to publish this post right now? Reply yes to confirm.' " +
        "Only call this tool after the user has confirmed with yes/ok/go ahead.",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        confirmed: z.boolean().describe("Must be true — set only after the user has explicitly confirmed they want to publish now"),
        linkedin_publish: z.boolean().optional().describe("Publish to LinkedIn"),
        instagram_publish: z.boolean().optional().describe("Publish to Instagram"),
        linkedin_account_id: z.number().optional().describe("Specific LinkedIn account ID (optional — uses default if omitted)"),
        instagram_account_id: z.number().optional().describe("Specific Instagram account ID (optional — uses default if omitted)"),
      },
    },
    async ({ uuid, confirmed, linkedin_publish, instagram_publish, linkedin_account_id, instagram_account_id }) => {
      if (!confirmed) {
        return { content: [{ type: "text" as const, text:
          "Publishing was not confirmed. Please ask the user: \"Are you sure you want to publish this post right now? Reply yes to confirm.\""
        }] };
      }

      try {
        const result = await laravel.publishPost(uuid, apiToken, {
          linkedin_publish,
          instagram_publish,
          linkedin_account_id,
          instagram_account_id,
        });
        
        return { content: [{ type: "text" as const, text: 
          `${result.message}\n\n` +
          `UUID: \`${result.uuid}\`\n` +
          `Status: ${result.status}\n` +
          `Platforms: ${result.platforms?.join(", ") || "None"}`
        }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  return createMcpHandler(server, { route: "/mcp" });
}
