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

/** Human-readable label for template type slugs. */
function formatTemplateType(type?: string): string {
  const labels: Record<string, string> = {
    graphic: "Single Image",
    carousel: "Carousel",
    quote: "Quote",
    quote_new: "Quote",
    tweet_style: "Tweet Style",
    placard: "Placard",
    evergreen: "Evergreen",
    libanners: "LinkedIn Banner",
  };
  return labels[type || ""] || type || "—";
}

/** Structured markdown details for a single template lookup. */
function buildTemplateDetailMarkdown(t: any): string {
  const editUrl = templateEditUrl(t.id, t.edit_url);
  const rows: [string, string][] = [
    ["Name", mdCell(t.name || "Untitled")],
    ["ID", `\`${t.id}\``],
    ["Type", formatTemplateType(t.type)],
    ["Size", `${t.width} × ${t.height} px`],
  ];
  if (t.updated_at) rows.push(["Last edited", fmtDate(t.updated_at)]);
  if (t.slides) rows.push(["Slides", String(t.slides)]);

  return [
    "## Template details",
    "",
    "| Field | Value |",
    "| --- | --- |",
    ...rows.map(([field, value]) => `| ${field} | ${value} |`),
    "",
    `[Open in editor](${editUrl})`,
  ].join("\n");
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
  const server = new McpServer(
    { name: "ContentDrips MCP", version: "1.0.0" },
    {
      instructions: [
        "ContentDrips MCP helps create, edit, and publish social media designs and posts.",
        "All tool results use standard MCP text content (markdown tables and links).",
        "Do not expect inline image previews — share the Open in editor link so the user can view designs in ContentDrips.",
        "Editor URL pattern: https://app.contentdrips.com/canvas?template={id}",
        "",
        "## MAIN FLOW — always ask first (all create cases)",
        "Applies to: carousel, graphic, quote, design, or social post from topic / YouTube / blog / TikTok / 'fit this into a carousel'.",
        "LinkedIn and Instagram equally. Never hallucinate or auto-pick a template.",
        "",
        "### Two tools — know the difference",
        "- AI Design Agent (run_ai_design_agent): builds a NEW layout with AI. On an EXISTING template it REMOVES/OVERRIDES the current design and replaces it. Destructive to the old canvas.",
        "- AI carousel maker / AI graphic maker (generate_ai_carousel / generate_ai_graphic): REQUIRES a template_id. KEEPS the template layout and fills it with new topic / blog / YouTube / TikTok content. Does NOT redesign the layout.",
        "",
        "### STEP 1 — No template yet?",
        "ASK: A) AI Design Agent on a NEW blank design, OR B) Choose an existing template (name/ID)?",
        "",
        "### STEP 2A — User chose Design Agent / new blank",
        "create_graphic → BEFORE run_ai_design_agent call get_brand_styles (see Style + model below) →",
        "run_ai_design_agent → render_template + check_job_status for PNG.",
        "",
        "### STEP 2B — User has or chose a template ID (name/ID)",
        "ALWAYS ask explicitly before proceeding (do not assume):",
        "  1) AI Design Agent — WARNING: overrides/removes the existing design on this template and generates a new one with AI, OR",
        "  2) AI carousel maker / AI graphic maker — keep this template's layout; fill with new topic/URL/YouTube/TikTok (recommended for 'new topic on this template').",
        "If they want maker (default for content fill):",
        "  get_template → get_template_structure (REQUIRED before generate_ai_*) →",
        "  carousel type → generate_ai_carousel; graphic/quote → generate_ai_graphic;",
        "  method=topic|blog|youtube|tiktok_reel → check_job_status.",
        "If they want Design Agent on that template_id: get_brand_styles first, then run_ai_design_agent (knowing it overrides) → optional render_template.",
        "Never call run_ai_design_agent for 'new topic/URL on this template' unless they explicitly chose Design Agent after the warning.",
        "Manual/LLM JSON fill (optional third path on a template_id): get_template_structure → generate_carousel(carousel_content) or generate_graphic(content_update) — full control over fields; not AI maker.",
        "",
        "### Style + model (REQUIRED before every run_ai_design_agent)",
        "Call get_brand_styles first (skip only if already fetched this conversation for the same profile).",
        "Saved styles:",
        "  - 0 styles → proceed with no style_id.",
        "  - 1 style → use it (pass style_id) unless the user declined or already named a different look.",
        "  - 2+ styles → ASK which style to use (list names). Never auto-pick. They may also choose none.",
        "Model (pro/basic):",
        "  - If can_use_pro_model is true → ASK Basic vs Pro before generating. Default basic if they do not choose.",
        "  - If can_use_pro_model is false → use model=basic. Do not mention upgrading unless they asked for Pro.",
        "Pass the chosen style_id and model into run_ai_design_agent.",
        "",
        "### STEP 3 — Social post (optional)",
        "create_post → set_post_images → schedule/publish ONLY platforms they named.",
        "",
        "### Browse tools",
        "get_my_templates / search_templates only when user asks to show/find/pick, or needs help after choosing existing template. Never silent auto-pick.",
        "",
        "### Export PNG/PDF",
        "run_ai_design_agent does not return PNG. Use render_template → check_job_status. Do NOT say export is unavailable.",
        "",
        "### Platforms (symmetric — LinkedIn and Instagram)",
        "ONLY platforms the user EXPLICITLY named. Never add the other.",
        "Instagram only → instagram_publish=true, linkedin_publish=false.",
        "LinkedIn only → linkedin_publish=true, instagram_publish=false.",
        "Confirm naming platforms. Always pass BOTH as explicit true/false.",
      ].join("\n"),
    }
  );
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
        "Use ONLY when the user asks to show, find, browse, or pick a template — not as a silent step before creating content. " +
        "Do NOT call this to auto-select a template for generate_ai_carousel / generate_ai_graphic. " +
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
        "Use ONLY when the user says 'show me my designs', 'my templates', 'list my creatives', or explicitly wants to pick one of their templates. " +
        "Do NOT call this to auto-pick a template when the user asks to create a new carousel/graphic — " +
        "for creation without a template ID, use create_graphic + run_ai_design_agent instead. " +
        "Returns a markdown table with an Open in editor link for each design. " +
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
        "Look up a single template (design, graphic, carousel) by its ID or name. " +
        "Returns a markdown details table and an Open in editor link. " +
        "Use when the user asks: 'get details of template 149900', 'show me template 163191', etc. " +
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

        return {
          content: [{ type: "text" as const, text: buildTemplateDetailMarkdown(t) }],
        };
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
        "MAIN FLOW path A: only after the user chose AI Design Agent / new blank (always ask Design Agent vs choose template first for create requests). " +
        "Then usually get_brand_styles (ask style if 2+; ask Pro if available) then run_ai_design_agent on the returned template_id. " +
        "Do NOT substitute an existing template from get_my_templates/search_templates. " +
        "Infer type/format/slides from the request when clear (e.g. 3 slides → type=carousel, slides=3; LinkedIn square → format=square). " +
        "Ask only for missing essentials (name if needed, format if ambiguous). " +
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

  // Tool 2d-styles: List saved brand styles + pro/basic eligibility
  server.registerTool(
    "get_brand_styles",
    {
      description:
        "REQUIRED before run_ai_design_agent. Lists the profile's saved visual styles and whether Pro model is available. " +
        "If 2+ styles: ASK which style to use (or none) — never auto-pick. " +
        "If exactly 1 style: use it unless the user declined. " +
        "If 0 styles: proceed with no style. " +
        "If can_use_pro_model is true: ASK Basic vs Pro (default Basic). " +
        "Then pass the chosen style_id and model into run_ai_design_agent.",
      inputSchema: {
        profile_id: z.string().optional().describe(
          "Optional profile/workspace ID. Uses the token's default profile if omitted."
        ),
      },
    },
    async ({ profile_id }) => {
      try {
        const result = await laravel.getBrandStyles(apiToken, profile_id);
        const styles = result.styles || [];
        const canPro = !!result.can_use_pro_model;
        const lines: string[] = [];

        if (styles.length === 0) {
          lines.push("No saved styles on this profile. Proceed with no `style_id`.");
        } else {
          lines.push(`Saved styles (**${styles.length}**):`);
          lines.push("");
          lines.push("| Name | ID | Mood | Palette |");
          lines.push("| --- | --- | --- | --- |");
          for (const s of styles) {
            const mood = Array.isArray(s.mood) ? s.mood.join(", ") : "—";
            const palette = Array.isArray(s.palette) ? s.palette.join(", ") : "—";
            lines.push(
              `| ${mdCell(s.name || "Untitled")} | \`${s.id}\` | ${mdCell(mood || "—")} | ${mdCell(palette || "—")} |`
            );
          }
          lines.push("");
          if (styles.length === 1) {
            lines.push(
              `Use this style: pass \`style_id="${styles[0].id}"\` unless the user declined.`
            );
          } else {
            lines.push(
              "ASK which style to use (or none). Never auto-pick. Then pass the chosen `style_id`."
            );
          }
        }

        lines.push("");
        lines.push("## Model");
        if (canPro) {
          lines.push("Pro is available. ASK: **Basic** or **Pro**? Default Basic if they do not choose.");
        } else {
          lines.push("Pro is not available on this plan. Use `model=\"basic\"`.");
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
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
        "AI Design Agent — builds a NEW Fabric.js layout with AI. " +
        "On a blank (create_graphic first): MAIN FLOW path for from-scratch designs. " +
        "On an EXISTING template_id: WARNING — removes/overrides the current design and replaces it with a new AI layout. " +
        "When the user already has a template ID and wants new topic/URL/YouTube content, do NOT use this by default — " +
        "ASK explicitly: Design Agent (override design) vs AI carousel/graphic maker (keep layout, fill content). " +
        "Recommend maker for content-fill. Only call this on an existing template after they confirm they want the override. " +
        "REQUIRED first: call get_brand_styles. If 2+ styles, ASK which one (or none). If Pro is available, ASK Basic vs Pro. " +
        "Then pass style_id and model. Does not return PNG — use render_template + check_job_status. Share the edit_url.",
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
        style_id: z.string().optional().describe(
          "Saved style ID from get_brand_styles. Required when the user picked a style. Omit for no saved style."
        ),
        model: z.enum(["basic", "pro"]).optional().describe(
          "AI model tier. 'basic' (default) or 'pro' (eligible plans only). Ask first when Pro is available."
        ),
      },
    },
    async ({ template_id, prompt, use_branding, style_id, model }) => {
      try {
        const result = await laravel.runAIDesignAgent(template_id, apiToken, {
          prompt,
          use_branding,
          style_id,
          model,
        });

        const extras = [];
        if (result.style_id) extras.push(`Style: \`${result.style_id}\``);
        extras.push(`Model: ${result.model || model || "basic"}`);

        const text =
          `AI design complete!\n\n` +
          `**${result.name}** (ID: \`${result.template_id}\`)\n` +
          `${result.summary}\n` +
          extras.join("  |  ") + `\n\n` +
          `**View & edit your design:** ${result.edit_url}\n\n` +
          `To export PNG/PDF of this design, call \`render_template\` with template_id=\`${result.template_id}\` ` +
          `(type=carousel or graphic) and profile_id, then \`check_job_status\` for export_url(s).`;

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
      description:
        "REQUIRED before generate_ai_carousel, generate_ai_graphic, generate_carousel, or generate_graphic. " +
        "Inspects editable field labels/types so you can build carousel_content or content_update correctly. " +
        "For manual JSON fill: get_template → get_template_structure → generate_carousel (carousel_content) or generate_graphic (content_update).",
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
      description:
        "AI carousel maker: for when the user gives a template_id and wants NEW content (topic / blog / YouTube / TikTok) " +
        "filled into that carousel while KEEPING the existing layout. " +
        "Not for Design Agent — Design Agent overrides the whole design. " +
        "If they have a template ID but have not chosen a path, ASK: Design Agent (overrides design) vs this maker (keep layout) — recommend this maker for content-fill. " +
        "REQUIRED order: get_template → get_template_structure → this tool. Then check_job_status. " +
        "Do NOT auto-pick a template. For brand-new designs with no template, ask MAIN FLOW first (blank Design Agent vs choose template).",
      inputSchema: {
        template_id: z.string().describe(
          "Existing carousel template ID — must be provided or chosen by the user. Do not invent or auto-pick."
        ),
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
      description:
        "AI graphic maker: for when the user gives a template_id and wants NEW content (topic / blog / YouTube / TikTok) " +
        "filled into that graphic/quote while KEEPING the existing layout. " +
        "Not for Design Agent — Design Agent overrides the whole design. " +
        "If they have a template ID but have not chosen a path, ASK: Design Agent (overrides design) vs this maker (keep layout) — recommend this maker for content-fill. " +
        "REQUIRED order: get_template → get_template_structure → this tool. Then check_job_status. " +
        "Use for non-carousel types; use generate_ai_carousel for carousels. Do NOT auto-pick a template.",
      inputSchema: {
        template_id: z.string().describe(
          "Existing graphic template ID (non-carousel) — must be provided or chosen by the user. Do not invent or auto-pick."
        ),
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

  // Tool 6: Generate Carousel (manual carousel_content JSON on a template)
  server.registerTool(
    "generate_carousel",
    {
      description:
        "Fill an EXISTING carousel template with manual/LLM-written JSON (carousel_content). template_id is required. " +
        "Use when the user (or you) wants full control over slide text/images based on get_template_structure — " +
        "not the AI carousel maker (generate_ai_carousel) and not Design Agent. " +
        "REQUIRED order: get_template → get_template_structure → build carousel_content matching field labels → this tool → check_job_status. " +
        "carousel_content shape: { carousel_topic?, intro_slide?: { elements: { [label]: { type, value, via?, image_query? } } }, " +
        "slides: [{ elements: {...} }], ending_slide?: { elements: {...} } }. " +
        "Element types are typically 'text' or 'image'. For Unsplash images use via='unsplash' and image_query.",
      inputSchema: {
        template_id: z.string().describe("Required. Existing carousel template ID — do not invent or auto-pick."),
        carousel_content: z.any().describe(
          "Required. Carousel JSON matching template structure. Example: " +
          "{ carousel_topic: 'Optional topic', " +
          "intro_slide: { elements: { heading: { type: 'text', value: 'Welcome' }, description: { type: 'text', value: '...' }, " +
          "image: { type: 'image', value: 'https://...' } } }, " +
          "slides: [{ elements: { heading: { type: 'text', value: 'Feature 1' }, " +
          "image: { type: 'image', value: '...', via: 'unsplash', image_query: 'workspace desk' } } }], " +
          "ending_slide: { elements: { heading: { type: 'text', value: 'Thank You!' } } } }"
        ),
        profile_id: z.string().describe("Your ContentDrips profile ID"),
        branding: z.any().optional().describe("Optional branding: { name, bio, handle, website_url, avatar_image_url }"),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format"),
      },
    },
    async ({ template_id, carousel_content, profile_id, branding, output }) => {
      try {
        const result = await renderer.generateCarousel({
          template_id, carousel_content, branding, output, profile_id, api_key: apiToken,
        });
        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  // Tool 7: Generate Graphic (manual content_update JSON on a template)
  server.registerTool(
    "generate_graphic",
    {
      description:
        "Fill an EXISTING graphic/quote template with a manual/LLM-written content_update array. template_id is required. " +
        "Use when the user (or you) wants full control over field values based on get_template_structure — " +
        "not the AI graphic maker (generate_ai_graphic) and not Design Agent. " +
        "REQUIRED order: get_template → get_template_structure → build content_update using exact field labels → this tool → check_job_status. " +
        "Each item: { type: 'textbox'|'image', label: '<field label from structure>', value: '...', fontSize?, fontColor?, textboxMaxHeight? }.",
      inputSchema: {
        template_id: z.string().describe("Required. Existing graphic/quote template ID — do not invent or auto-pick."),
        content_update: z.array(z.any()).describe(
          "Required. Array of field updates matching get_template_structure labels. Example: " +
          "[{ type: 'textbox', label: 'headline', value: 'Flash Sale Alert!', fontSize: '56', fontColor: '#FF6B6B', textboxMaxHeight: 'auto' }, " +
          "{ type: 'textbox', label: 'subheadline', value: '50% OFF Everything', fontSize: '32', fontColor: '#4ECDC4', textboxMaxHeight: 150 }, " +
          "{ type: 'textbox', label: 'cta', value: 'SHOP NOW', fontSize: '36', fontColor: '#FFFFFF', textboxMaxHeight: 100 }]"
        ),
        profile_id: z.string().describe("Your ContentDrips profile ID"),
        branding: z.any().optional().describe("Optional branding: { name, bio, handle, website_url, avatar_image_url }"),
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

  // Tool 7b: Render current template canvas to PNG/PDF (no content rewrite)
  server.registerTool(
    "render_template",
    {
      description:
        "Export the CURRENT saved design for a template_id as PNG or PDF (render job → export_url). " +
        "Does NOT rewrite content — use after run_ai_design_agent, or anytime the user wants PNG/PDF of an existing design. " +
        "Works for both carousels and single-image graphics: set type to 'carousel' or 'graphic' (check get_template if unsure). " +
        "Then call check_job_status with the returned job_id to get export_url(s). " +
        "Use this instead of saying export is unavailable.",
      inputSchema: {
        template_id: z.string().describe("Template/design ID to render as-is"),
        profile_id: z.string().describe("Your ContentDrips profile ID"),
        type: z.enum(["carousel", "graphic"]).describe(
          "'carousel' for multi-slide designs; 'graphic' for single-image / quote designs"
        ),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format (default: png)"),
      },
    },
    async ({ template_id, profile_id, type, output }) => {
      try {
        const result = await renderer.renderTemplate({
          template_id, profile_id, type, output, api_key: apiToken,
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
      description:
        "Poll a render job and get export_url(s) (PNG/PDF download links) when complete. " +
        "Use after render_template, generate_ai_carousel, generate_ai_graphic, generate_carousel, or generate_graphic.",
      inputSchema: {
        job_id: z.string().describe("Job ID returned from render_template or any generate tool"),
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
      description:
        "Update a post's caption or platform flags. " +
        "Only set linkedin_publish/instagram_publish true for platforms the user explicitly requested. " +
        "Do not enable LinkedIn by default when the user asked for Instagram (or vice versa).",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        caption: z.string().optional().describe("New caption"),
        linkedin_publish: z.boolean().optional().describe("Enable LinkedIn only if the user asked for LinkedIn"),
        instagram_publish: z.boolean().optional().describe("Enable Instagram only if the user asked for Instagram"),
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
        "Use this after render_template, generate_ai_carousel, generate_ai_graphic, generate_carousel, or generate_graphic + check_job_status. " +
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
      description:
        "Schedule a post for future publishing. " +
        "ONLY enable platforms the user explicitly named. " +
        "If they said Instagram only → instagram_publish=true, linkedin_publish=false. " +
        "Never add LinkedIn (or Instagram) just because it is connected. Ask if unclear. " +
        "Both linkedin_publish and instagram_publish are required explicit booleans.",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        scheduled_time: z.string().describe("Schedule time in ISO format (e.g. '2024-03-15T09:00:00')"),
        timezone: z.string().describe("User's timezone (e.g. 'America/New_York', 'UTC', 'Europe/London')"),
        linkedin_publish: z.boolean().describe(
          "Required. true only if the user explicitly asked to schedule on LinkedIn; otherwise false."
        ),
        instagram_publish: z.boolean().describe(
          "Required. true only if the user explicitly asked to schedule on Instagram; otherwise false."
        ),
        linkedin_account_id: z.number().optional().describe("Specific LinkedIn account ID (uses default if not specified)"),
        instagram_account_id: z.number().optional().describe("Specific Instagram account ID (uses default if not specified)"),
      },
    },
    async ({ uuid, scheduled_time, timezone, linkedin_publish, instagram_publish, linkedin_account_id, instagram_account_id }) => {
      const li = linkedin_publish === true;
      const ig = instagram_publish === true;
      if (!li && !ig) {
        return {
          content: [{
            type: "text" as const,
            text:
              "Error: At least one platform must be true. " +
              "Ask the user which platform(s) to schedule on, then pass linkedin_publish and instagram_publish explicitly.",
          }],
          isError: true,
        };
      }

      try {
        const result = await laravel.schedulePost(uuid, apiToken, {
          scheduled_time,
          timezone,
          linkedin_publish: li,
          instagram_publish: ig,
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
          `Platforms: ${platforms.join(", ") || "None"}`
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
        "Publish a post immediately. ONLY enable platforms the user EXPLICITLY named — no LinkedIn bias. " +
        "Instagram-only request → instagram_publish=true, linkedin_publish=false. Never publish to an extra platform. " +
        "Before calling: confirm with platforms named, e.g. 'Publish to Instagram only right now? Reply yes to confirm.' " +
        "Only call after the user confirms yes/ok/go ahead. Both linkedin_publish and instagram_publish are required booleans.",
      inputSchema: {
        uuid: z.string().describe("The post UUID"),
        confirmed: z.boolean().describe("Must be true — set only after the user explicitly confirmed publish, including which platform(s)"),
        linkedin_publish: z.boolean().describe(
          "Required. true only if the user explicitly asked to publish on LinkedIn; otherwise false."
        ),
        instagram_publish: z.boolean().describe(
          "Required. true only if the user explicitly asked to publish on Instagram; otherwise false."
        ),
        linkedin_account_id: z.number().optional().describe("Specific LinkedIn account ID (optional — uses default if omitted)"),
        instagram_account_id: z.number().optional().describe("Specific Instagram account ID (optional — uses default if omitted)"),
      },
    },
    async ({ uuid, confirmed, linkedin_publish, instagram_publish, linkedin_account_id, instagram_account_id }) => {
      if (!confirmed) {
        return { content: [{ type: "text" as const, text:
          "Publishing was not confirmed. Ask the user and name platforms, e.g. " +
          "\"Publish to Instagram only right now? Reply yes to confirm.\""
        }] };
      }

      const li = linkedin_publish === true;
      const ig = instagram_publish === true;
      if (!li && !ig) {
        return {
          content: [{
            type: "text" as const,
            text:
              "Error: At least one platform must be true. " +
              "Ask which platform(s) to publish to, then pass linkedin_publish and instagram_publish explicitly " +
              "(e.g. Instagram only → linkedin_publish=false, instagram_publish=true).",
          }],
          isError: true,
        };
      }

      try {
        const result = await laravel.publishPost(uuid, apiToken, {
          linkedin_publish: li,
          instagram_publish: ig,
          linkedin_account_id,
          instagram_account_id,
        });

        return { content: [{ type: "text" as const, text:
          `${result.message}\n\n` +
          `UUID: \`${result.uuid}\`\n` +
          `Status: ${result.status}\n` +
          `Platforms requested: ${[li && "LinkedIn", ig && "Instagram"].filter(Boolean).join(", ")}\n` +
          `Platforms reported: ${result.platforms?.join(", ") || "None"}`
        }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  return createMcpHandler(server, { route: "/mcp" });
}
