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

function collectCategories(data: {
  type_categories?: any[];
  db_categories?: any[];
}): { label: string; template_count?: number; search_category: string }[] {
  return [
    ...(data.type_categories || []).map((cat) => ({
      label: String(cat.label || cat.slug),
      template_count: typeof cat.template_count === "number" ? cat.template_count : undefined,
      search_category: String(cat.search_category || cat.slug),
    })),
    ...(data.db_categories || []).map((cat) => ({
      label: String(cat.name),
      template_count: typeof cat.template_count === "number" ? cat.template_count : undefined,
      search_category: String(cat.search_category || cat.name),
    })),
  ].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/** Build a single markdown table of all template categories. */
function buildCategoriesMarkdown(data: {
  type_categories?: any[];
  db_categories?: any[];
}): string {
  const categories = collectCategories(data);

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

// ── ChatGPT / MCP tool metadata ───────────────────────────────────────────────

const READ_CLOSED = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const WRITE_CLOSED = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;

const WRITE_OPEN = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: true,
} as const;

const DESTRUCTIVE_CLOSED = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

const DESTRUCTIVE_OPEN = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: true,
} as const;

const templateSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  updated_at: z.string().optional(),
  edit_url: z.string().optional(),
  slides: z.number().optional(),
});

const templateListOutput = {
  count: z.number(),
  templates: z.array(templateSummarySchema),
};

const templateDetailOutput = {
  template_id: z.string().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  slides: z.number().optional(),
  edit_url: z.string().optional(),
  updated_at: z.string().optional(),
  profile_id: z.string().optional(),
  message: z.string().optional(),
};

const categoriesOutput = {
  categories: z.array(
    z.object({
      label: z.string(),
      template_count: z.number().optional(),
      search_category: z.string(),
    })
  ),
};

const jobQueuedOutput = {
  job_id: z.string().optional(),
  status: z.string().optional(),
  message: z.string().optional(),
};

const jobStatusOutput = {
  job_id: z.string().optional(),
  status: z.string().optional(),
  export_url: z.string().optional(),
  export_urls: z.array(z.string()).optional(),
  message: z.string().optional(),
};

const brandStylesOutput = {
  can_use_pro_model: z.boolean(),
  styles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mood: z.array(z.string()).optional(),
      palette: z.array(z.string()).optional(),
    })
  ),
};

const designAgentOutput = {
  template_id: z.string().optional(),
  name: z.string().optional(),
  summary: z.string().optional(),
  edit_url: z.string().optional(),
  style_id: z.string().optional(),
  model: z.string().optional(),
};

const templateStructureOutput = {
  template_id: z.string().optional(),
  type: z.string().optional(),
  structure: z.any(),
};

const profilesOutput = {
  default_profile_id: z.string().optional(),
  profiles: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      is_default: z.boolean().optional(),
    })
  ),
};

const socialAccountsOutput = {
  count: z.number(),
  linkedin_connected: z.boolean().optional(),
  instagram_connected: z.boolean().optional(),
  connect_url: z.string().optional(),
  accounts: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      source: z.string().optional(),
      handle: z.string().optional(),
      account_type: z.string().optional(),
    })
  ),
};

const postSummarySchema = z.object({
  uuid: z.string(),
  caption: z.string().optional(),
  status: z.string().optional(),
  scheduled_time: z.string().optional(),
  image_count: z.number().optional(),
  linkedin_publish: z.boolean().optional(),
  instagram_publish: z.boolean().optional(),
  post_url: z.string().optional(),
});

const postsListOutput = {
  count: z.number(),
  posts: z.array(postSummarySchema),
};

const postDetailOutput = {
  uuid: z.string().optional(),
  status: z.string().optional(),
  caption: z.string().optional(),
  post_url: z.string().optional(),
  image_count: z.number().optional(),
  scheduled_time: z.string().optional(),
  scheduled_time_utc: z.string().optional(),
  error_log: z.string().optional(),
  linkedin_publish: z.boolean().optional(),
  instagram_publish: z.boolean().optional(),
  profile_id: z.string().optional(),
  message: z.string().optional(),
  platforms: z.array(z.string()).optional(),
};

const deleteGraphicOutput = {
  deleted_id: z.string().optional(),
  message: z.string().optional(),
};

const deletePostOutput = {
  uuid: z.string(),
  message: z.string().optional(),
};

const postImagesOutput = {
  uuid: z.string().optional(),
  message: z.string().optional(),
  images: z.array(z.string()).optional(),
  image_count: z.number().optional(),
  new_images: z.array(z.string()).optional(),
  errors: z.array(z.string()).optional(),
  deleted_count: z.number().optional(),
};

function toNum(value: unknown): number | undefined {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value !== "" && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

function summarizeTemplate(t: any) {
  return {
    id: String(t.id),
    name: t.name || "Untitled",
    type: t.type != null ? String(t.type) : undefined,
    width: toNum(t.width),
    height: toNum(t.height),
    updated_at: t.updated_at != null ? String(t.updated_at) : undefined,
    edit_url: templateEditUrl(t.id, t.edit_url),
    slides: toNum(t.slides),
  };
}

function summarizeJob(result: any) {
  const jobId = result?.job_id ?? result?.jobId ?? result?.id;
  return {
    job_id: jobId != null ? String(jobId) : undefined,
    status: result?.status != null ? String(result.status) : undefined,
    message: result?.message != null ? String(result.message) : undefined,
    export_url: result?.export_url != null ? String(result.export_url) : undefined,
    export_urls: Array.isArray(result?.export_urls) ? result.export_urls.map(String) : undefined,
  };
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
        // ChatGPT weights the first ~512 chars — keep hard rules here.
        "CRITICAL: template = design = graphic = carousel = infographic (same thing). If the user gives a template/design ID or NAME → AI maker (keep layout): get_template then generate_ai_carousel or generate_ai_graphic. If they give NO id/name → AI Design Agent: get_profiles → create_graphic(profile_id) → get_brand_styles (if 2+ styles ASK which) → run_ai_design_agent. After Design Agent share edit_url only — do NOT render unless they ask to preview/download/publish. ALWAYS pass profile_id. ChatGPT: if the user uploaded an image, pass it as reference_image on run_ai_design_agent.",
        "Editor: https://app.contentdrips.com/canvas?template={id}",
        "No inline image previews. Do not auto-render to 'show' the design.",
        "",
        "## Route by whether they named a template",
        "Words 'template', 'design', 'graphic', 'carousel', 'infographic', 'creative' all mean a ContentDrips canvas.",
        "- Named ID or name (e.g. 'use template 5821', 'use my LinkedIn carousel') → AI maker. Resolve with get_template if name only.",
        "- No ID/name → AI Design Agent on a new blank. Do not ask Design Agent vs template unless they are ambiguous.",
        "- Exception: they explicitly say override/recreate an existing canvas with Design Agent (or attach a reference image to recreate in their style) → Design Agent, even if a template was named.",
        "",
        "## Two tools",
        "- run_ai_design_agent: NEW layout. Use when no existing template is named, or they want a reference image recreated in their style.",
        "- generate_ai_carousel / generate_ai_graphic: KEEPS existing layout; fills topic/URL. Requires resolved template_id + profile_id. Starts a render job.",
        "",
        "### STEP 0 — Workspace (required)",
        "Call get_profiles before create_graphic, create_post, generate_*, render_template, schedule_post, or publish_post.",
        "1 profile → use that profile_id. 2+ → ASK which workspace, then pass that profile_id. Never omit profile_id.",
        "",
        "### No template ID/name — Design Agent",
        "get_profiles → create_graphic(profile_id) → get_brand_styles → if 2+ styles ASK which (or none); if 1 use it unless declined → run_ai_design_agent (pass reference_image if they uploaded one) → STOP and share edit_url.",
        "Do NOT render. Preview/download later → render_template + check_job_status with the same profile_id.",
        "",
        "### Has template ID or name — AI maker",
        "get_template (by id or name) → get_template_structure → carousel type → generate_ai_carousel; graphic/quote/infographic → generate_ai_graphic. Pass profile_id. Then check_job_status.",
        "Only use run_ai_design_agent on that template if they explicitly asked to override/recreate the layout (or recreate from a reference image).",
        "Manual JSON: get_template_structure → generate_carousel or generate_graphic.",
        "",
        "### Style + model (REQUIRED before every run_ai_design_agent)",
        "Call get_brand_styles with the same profile_id.",
        "0 styles → no style_id. 1 style → use it unless they declined. 2+ → ASK which by name (or none). Never auto-pick.",
        "If can_use_pro_model: ASK Basic vs Pro (default basic). Else model=basic.",
        "",
        "### Reference images (ChatGPT uploads)",
        "If the user attached an image ('recreate this', 'use this as reference', 'in my style from this pic'), pass it to run_ai_design_agent as reference_image: an https URL (preferred) or a data:image/...;base64,... URI. Do not skip Design Agent because an image was attached.",
        "",
        "### Social post (only if they asked)",
        "Reuse the same profile_id. create_post(profile_id) → set_post_images → schedule/publish ONLY named platforms.",
        "If profile_id is missing, call get_profiles — do not tell the user you cannot proceed.",
        "",
        "### Browse tools",
        "get_my_templates / search_templates only when they ask to show/find/pick. Never silent auto-pick.",
        "",
        "### Export PNG/PDF",
        "render_template is OPTIONAL. Use only when they ask to preview, download, attach images, or publish. Export is available — do not say it is not.",
        "",
        "### Platforms",
        "ONLY platforms they named. Instagram only → instagram_publish=true, linkedin_publish=false. LinkedIn only → opposite. Always pass both booleans.",
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
      outputSchema: categoriesOutput,
      annotations: READ_CLOSED,
    },
    async () => {
      try {
        const result = await laravel.getTemplateCategories(apiToken);
        const categories = collectCategories(result);
        return {
          content: [{ type: "text" as const, text: buildCategoriesMarkdown(result) }],
          structuredContent: { categories },
        };
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
      outputSchema: templateListOutput,
      annotations: READ_CLOSED,
    },
    async ({ query, category, type }) => {
      try {
        const result = await laravel.searchTemplates(query, {
          category: category || type,
          apiKey: apiToken,
        });
        const templates = result.templates || [];
        const count = result.count ?? templates.length;
        const filterLabel = result.category ? ` in **${result.category}**` : "";
        const queryLabel = result.query ? ` matching **${result.query}**` : "";
        const content = buildTemplateContent(templates, count, {
          title: `Found **${count}** public template${count !== 1 ? "s" : ""}${filterLabel}${queryLabel}:`,
          emptyMessage: "No public templates found. Try get_template_categories for available categories, or a different keyword.",
        });
        return {
          content,
          structuredContent: {
            count,
            templates: templates.slice(0, 20).map(summarizeTemplate),
          },
        };
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
      outputSchema: templateListOutput,
      annotations: READ_CLOSED,
    },
    async ({ type, profile_id }) => {
      try {
        const result = await laravel.getMyTemplates(type, apiToken, profile_id);
        const templates = result.templates || [];
        const count = result.count ?? templates.length;
        const content = buildTemplateContent(templates, count, {
          title: `Your designs (**${count}**):`,
          emptyMessage: "You don't have any saved designs yet. Use create_graphic to make a new blank design.",
        });
        return {
          content,
          structuredContent: {
            count,
            templates: templates.slice(0, 20).map(summarizeTemplate),
          },
        };
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
        "Look up a single template/design/graphic/carousel by ID or name. " +
        "REQUIRED before AI maker when the user named a design but you only have a name (or need to confirm ID). " +
        "Returns details and an Open in editor link. Searches the user's designs first, then public templates.",
      inputSchema: {
        template_id: z.string().optional().describe("Numeric template ID (e.g. '163191')"),
        template_name: z.string().optional().describe("Template name or partial name (e.g. 'FB Ad Creative v1')"),
      },
      outputSchema: templateDetailOutput,
      annotations: READ_CLOSED,
    },
    async ({ template_id, template_name }) => {
      if (!template_id && !template_name) {
        return {
          content: [{ type: "text" as const, text: "Please provide a template ID or name." }],
          structuredContent: { message: "Please provide a template ID or name." },
        };
      }
      try {
        const result = await laravel.findTemplate(
          { id: template_id, name: template_name },
          apiToken
        );
        const t = result.template;
        if (!t) {
          return {
            content: [{ type: "text" as const, text: "Template not found." }],
            structuredContent: { message: "Template not found." },
          };
        }

        const summary = summarizeTemplate(t);
        return {
          content: [{ type: "text" as const, text: buildTemplateDetailMarkdown(t) }],
          structuredContent: {
            template_id: summary.id,
            name: summary.name,
            type: summary.type,
            width: summary.width,
            height: summary.height,
            slides: summary.slides,
            edit_url: summary.edit_url,
            updated_at: summary.updated_at,
          },
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
        "Use when the user did NOT give an existing template/design ID or name. " +
        "REQUIRED first: call get_profiles. If 2+ workspaces, ASK which one. ALWAYS pass profile_id — never omit it. " +
        "Then get_brand_styles (if 2+ styles ASK which; if 1 use it unless declined; ask Pro if available) then run_ai_design_agent. " +
        "If they uploaded a reference image, pass it to run_ai_design_agent as reference_image. " +
        "After Design Agent: share the editor link. Do NOT call render_template unless they ask to preview/download. " +
        "Do NOT substitute an existing template from get_my_templates/search_templates. " +
        "Infer type/format/slides when clear (e.g. infographic → type=graphic; 3 slides → type=carousel). " +
        "Custom sizes: format='custom' plus width + height (100–3000 px). Do NOT fall back to a preset.",
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
        profile_id: z.string().describe(
          "REQUIRED. Workspace/profile ID from get_profiles. Call get_profiles first. If 2+ profiles, ask the user which to use. Never omit."
        ),
      },
      outputSchema: templateDetailOutput,
      annotations: WRITE_CLOSED,
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
          profile_id: Number(profile_id),
        });
        let text =
          `Design created! ✓\n\n` +
          `**${result.name}**\n` +
          `ID: \`${result.template_id}\`  |  Type: ${result.type}  |  Size: ${result.width}×${result.height}`;
        if (result.slides) text += `  |  Slides: ${result.slides}`;
        if (profile_id) text += `  |  Profile: \`${profile_id}\``;
        text += `\n\n**Open in editor:** ${result.edit_url}`;
        text += `\n\nReuse this profile_id on later tools (create_post, render_template, generate_*). Do not render unless the user asks to preview or download.`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            template_id: result.template_id != null ? String(result.template_id) : undefined,
            name: result.name,
            type: result.type,
            width: toNum(result.width),
            height: toNum(result.height),
            slides: toNum(result.slides),
            edit_url: result.edit_url,
            profile_id,
          },
        };
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
      outputSchema: deleteGraphicOutput,
      annotations: DESTRUCTIVE_CLOSED,
    },
    async ({ template_id }) => {
      try {
        const result = await laravel.deleteGraphic(template_id, apiToken);
        return {
          content: [{ type: "text" as const, text: `${result.message} (ID: \`${result.deleted_id}\`)` }],
          structuredContent: {
            deleted_id: result.deleted_id != null ? String(result.deleted_id) : template_id,
            message: result.message,
          },
        };
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
          "Workspace/profile ID from get_profiles. Pass the same profile_id you will use for create_graphic / run_ai_design_agent."
        ),
      },
      outputSchema: brandStylesOutput,
      annotations: READ_CLOSED,
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

        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
          structuredContent: {
            can_use_pro_model: canPro,
            styles: styles.map((s: any) => ({
              id: String(s.id),
              name: s.name || "Untitled",
              mood: Array.isArray(s.mood) ? s.mood.map(String) : undefined,
              palette: Array.isArray(s.palette) ? s.palette.map(String) : undefined,
            })),
          },
        };
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
        "AI Design Agent — builds a NEW layout with AI. " +
        "Use when the user did NOT name an existing template/design (ID or name), or they uploaded a reference image to recreate in their style. " +
        "Call create_graphic first (with profile_id). " +
        "If they DID name an existing template, use generate_ai_carousel/generate_ai_graphic instead unless they explicitly asked to override/recreate the layout. " +
        "REQUIRED: get_profiles then get_brand_styles. If 2+ styles, ASK which (or none) — never auto-pick. If Pro available, ASK Basic vs Pro. " +
        "If the user uploaded an image in ChatGPT, pass it as reference_image (https URL preferred, or data URI). " +
        "When finished: share edit_url and STOP. Do NOT render unless they ask to preview, download, or publish.",
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
        reference_image: z.string().optional().describe(
          "Optional reference image from the user (ChatGPT file/image upload). " +
          "Pass an https URL if available, otherwise a data:image/png|jpeg|webp|gif;base64,... URI. " +
          "Use when they say 'recreate this', 'use this image as reference', or attach a picture. " +
          "The agent copies STRUCTURE from the image and applies the chosen saved style for look. Omit if no image."
        ),
      },
      outputSchema: designAgentOutput,
      annotations: DESTRUCTIVE_CLOSED,
    },
    async ({ template_id, prompt, use_branding, style_id, model, reference_image }) => {
      try {
        const result = await laravel.runAIDesignAgent(template_id, apiToken, {
          prompt,
          use_branding,
          style_id,
          model,
          reference_image,
        });

        const extras = [];
        if (result.style_id) extras.push(`Style: \`${result.style_id}\``);
        extras.push(`Model: ${result.model || model || "basic"}`);
        if (reference_image) extras.push("Reference image: yes");

        const text =
          `AI design complete!\n\n` +
          `**${result.name}** (ID: \`${result.template_id}\`)\n` +
          `${result.summary}\n` +
          extras.join("  |  ") + `\n\n` +
          `**View & edit your design:** ${result.edit_url}\n\n` +
          `Stop here unless the user asks to preview, download PNG/PDF, attach to a post, or publish. ` +
          `Only then call \`render_template\` with this template_id and the same profile_id.`;

        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            template_id: result.template_id != null ? String(result.template_id) : template_id,
            name: result.name,
            summary: result.summary,
            edit_url: result.edit_url,
            style_id: result.style_id != null ? String(result.style_id) : undefined,
            model: result.model || model || "basic",
          },
        };
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
      outputSchema: templateStructureOutput,
      annotations: READ_CLOSED,
    },
    async ({ template_id }) => {
      try {
        const result = await laravel.getTemplateStructure(template_id, apiToken);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: {
            template_id,
            type: result?.type != null ? String(result.type) : undefined,
            structure: result,
          },
        };
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
        "AI carousel maker: fill an EXISTING carousel template (user gave ID or name) with new topic/blog/YouTube/TikTok while KEEPING the layout. " +
        "If they only gave a name, call get_template first. " +
        "Do NOT use when they gave no template/design — that is create_graphic + run_ai_design_agent. " +
        "REQUIRES template_id and profile_id from get_profiles. This starts a render job. " +
        "Order: get_template → get_template_structure → this tool → check_job_status. Never auto-pick a template.",
      inputSchema: {
        template_id: z.string().describe(
          "Existing carousel template ID — must be provided or chosen by the user. Do not invent or auto-pick."
        ),
        method: z.enum(["topic", "blog", "youtube", "tiktok_reel"]).describe(
          "'topic' = free text idea | 'blog' = blog URL | 'youtube' = YouTube URL | 'tiktok_reel' = TikTok/Reel URL"
        ),
        input: z.string().describe("Your topic text or the content URL"),
        profile_id: z.string().describe("REQUIRED. Workspace/profile ID from get_profiles. Same profile as the template."),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format (default: png)"),
      },
      outputSchema: jobQueuedOutput,
      annotations: WRITE_OPEN,
    },
    async ({ template_id, method, input, profile_id, output }) => {
      try {
        const result = await renderer.generateAiCarousel({
          template_id, method, input, output, profile_id, api_key: apiToken,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: summarizeJob(result),
        };
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
        "AI graphic maker: fill an EXISTING graphic/quote/infographic template (user gave ID or name) with new topic/blog/YouTube/TikTok while KEEPING the layout. " +
        "If they only gave a name, call get_template first. " +
        "Do NOT use when they gave no template/design — that is create_graphic + run_ai_design_agent. " +
        "REQUIRES template_id and profile_id from get_profiles. This starts a render job. " +
        "Order: get_template → get_template_structure → this tool → check_job_status. Never auto-pick a template.",
      inputSchema: {
        template_id: z.string().describe(
          "Existing graphic template ID (non-carousel) — must be provided or chosen by the user. Do not invent or auto-pick."
        ),
        method: z.enum(["topic", "blog", "youtube", "tiktok_reel"]).describe(
          "'topic' = free text idea | 'blog' = blog URL | 'youtube' = YouTube URL | 'tiktok_reel' = TikTok/Reel URL"
        ),
        input: z.string().describe("Your topic text or the content URL"),
        profile_id: z.string().describe("REQUIRED. Workspace/profile ID from get_profiles. Same profile as the template."),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format (default: png)"),
      },
      outputSchema: jobQueuedOutput,
      annotations: WRITE_OPEN,
    },
    async ({ template_id, method, input, profile_id, output }) => {
      try {
        const result = await renderer.generateAiGraphic({
          template_id, method, input, output, profile_id, api_key: apiToken,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: summarizeJob(result),
        };
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
        profile_id: z.string().describe("REQUIRED. Workspace/profile ID from get_profiles. Same profile as the template."),
        branding: z.any().optional().describe("Optional branding: { name, bio, handle, website_url, avatar_image_url }"),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format"),
      },
      outputSchema: jobQueuedOutput,
      annotations: WRITE_CLOSED,
    },
    async ({ template_id, carousel_content, profile_id, branding, output }) => {
      try {
        const result = await renderer.generateCarousel({
          template_id, carousel_content, branding, output, profile_id, api_key: apiToken,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: summarizeJob(result),
        };
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
        profile_id: z.string().describe("REQUIRED. Workspace/profile ID from get_profiles. Same profile as the template."),
        branding: z.any().optional().describe("Optional branding: { name, bio, handle, website_url, avatar_image_url }"),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format"),
      },
      outputSchema: jobQueuedOutput,
      annotations: WRITE_CLOSED,
    },
    async ({ template_id, content_update, profile_id, branding, output }) => {
      try {
        const result = await renderer.generateGraphic({
          template_id, content_update, branding, output, profile_id, api_key: apiToken,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: summarizeJob(result),
        };
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
        "Export PNG/PDF of an already-saved design (render job → export_url). Does NOT rewrite content. " +
        "ONLY call this when the user asks to preview, download, export, attach images to a post, or publish/schedule. " +
        "Do NOT call automatically after run_ai_design_agent or create_graphic — those are done when you share the editor link. " +
        "REQUIRED: pass profile_id from get_profiles (same workspace as the design). " +
        "Set type to 'carousel' or 'graphic'. Then check_job_status for export_url(s).",
      inputSchema: {
        template_id: z.string().describe("Template/design ID to render as-is"),
        profile_id: z.string().describe("REQUIRED. Workspace/profile ID from get_profiles. Same profile as the template."),
        type: z.enum(["carousel", "graphic"]).describe(
          "'carousel' for multi-slide designs; 'graphic' for single-image / quote designs"
        ),
        output: z.enum(["png", "pdf"]).default("png").describe("Output format (default: png)"),
      },
      outputSchema: jobQueuedOutput,
      annotations: WRITE_CLOSED,
    },
    async ({ template_id, profile_id, type, output }) => {
      try {
        const result = await renderer.renderTemplate({
          template_id, profile_id, type, output, api_key: apiToken,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: summarizeJob(result),
        };
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
      outputSchema: jobStatusOutput,
      annotations: READ_CLOSED,
    },
    async ({ job_id }) => {
      try {
        const result = await renderer.checkJobStatus(job_id, apiToken);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
          structuredContent: summarizeJob({ ...result, job_id: result.job_id ?? job_id }),
        };
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
        "Get the user's ContentDrips workspaces (profiles). " +
        "REQUIRED before create_graphic, create_post, generate_ai_*, render_template, schedule_post, or publish_post. " +
        "If 2+ profiles: ASK which workspace to use — never guess. If 1: use that profile_id. " +
        "Always pass the chosen profile_id into later tools. Posts and scheduling fail without it.",
      inputSchema: {
        _hint: z.string().optional().describe("Ignored — no input required. Pass nothing or omit entirely."),
      },
      outputSchema: profilesOutput,
      annotations: READ_CLOSED,
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
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            default_profile_id: result.default_profile_id != null ? String(result.default_profile_id) : undefined,
            profiles: profiles.map((p: any) => ({
              id: String(p.id),
              name: p.name || "Untitled",
              is_default: p.id === result.default_profile_id,
            })),
          },
        };
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
      outputSchema: socialAccountsOutput,
      annotations: READ_CLOSED,
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
        
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            count: result.count ?? (result.accounts || []).length,
            linkedin_connected: !!result.linkedin_connected,
            instagram_connected: !!result.instagram_connected,
            connect_url: result.connect_url,
            accounts: (result.accounts || []).map((acc: any) => ({
              id: String(acc.id),
              name: acc.name || "Untitled",
              source: acc.source,
              handle: acc.handle,
              account_type: acc.account_type,
            })),
          },
        };
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
      outputSchema: postsListOutput,
      annotations: READ_CLOSED,
    },
    async ({ status }) => {
      try {
        const result = await laravel.listPosts(apiToken, status || undefined);
        const posts = result.posts || [];
        let text = `Found ${result.count} post(s):\n\n`;
        
        for (const p of posts) {
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
        
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            count: result.count ?? posts.length,
            posts: posts.map((p: any) => ({
              uuid: String(p.uuid),
              caption: p.caption,
              status: p.status,
              scheduled_time: p.scheduled_time,
              image_count: toNum(p.image_count),
              linkedin_publish: p.linkedin_publish,
              instagram_publish: p.instagram_publish,
              post_url: p.post_url,
            })),
          },
        };
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
      outputSchema: postDetailOutput,
      annotations: READ_CLOSED,
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
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : uuid,
            status: result.status,
            caption: result.caption,
            post_url: result.post_url,
            image_count: toNum(result.image_count),
            scheduled_time: result.scheduled_time,
            error_log: result.error_log,
            linkedin_publish: result.linkedin_publish,
            instagram_publish: result.instagram_publish,
          },
        };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  server.registerTool(
    "create_post",
    {
      description:
        "Create a new draft post with a caption and optional images. " +
        "REQUIRED: call get_profiles first and ALWAYS pass profile_id — scheduling/publishing will fail without it. " +
        "Do not say you lack profile_id; fetch it with get_profiles. " +
        "For ContentDrips PNG exports, prefer create_post then set_post_images with export_urls (only after the user asked to post).",
      inputSchema: {
        caption: z.string().describe("The post caption/text"),
        profile_id: z.string().describe(
          "REQUIRED. Workspace/profile ID from get_profiles. Call get_profiles if you do not have it yet."
        ),
        images_url: z.array(z.string()).optional().describe("Array of image URLs from export_urls"),
      },
      outputSchema: postDetailOutput,
      annotations: WRITE_CLOSED,
    },
    async ({ caption, profile_id, images_url }) => {
      try {
        const result = await laravel.createPost(apiToken, {
          caption,
          profile_id: parseInt(profile_id),
          images_url,
        });
        let text = `Post created!\n\nUUID: \`${result.uuid}\`\n`;
        if (result.post_url) text += `View/Edit: ${result.post_url}\n`;
        text += `Profile ID: \`${profile_id}\`\n`;
        text += `\nUse this UUID and the same profile_id to attach images, schedule, or publish.`;
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : undefined,
            status: result.status,
            post_url: result.post_url,
            caption: result.caption ?? caption,
            profile_id,
          },
        };
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
      outputSchema: postDetailOutput,
      annotations: WRITE_CLOSED,
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
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : uuid,
            status: result.status,
            post_url: result.post_url,
            caption: result.caption ?? caption,
            linkedin_publish: result.linkedin_publish ?? linkedin_publish,
            instagram_publish: result.instagram_publish ?? instagram_publish,
          },
        };
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
      outputSchema: deletePostOutput,
      annotations: DESTRUCTIVE_CLOSED,
    },
    async ({ uuid }) => {
      try {
        await laravel.deletePost(uuid, apiToken);
        return {
          content: [{ type: "text" as const, text: `Post deleted: \`${uuid}\`` }],
          structuredContent: { uuid, message: `Post deleted: ${uuid}` },
        };
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
      outputSchema: postImagesOutput,
      annotations: WRITE_CLOSED,
    },
    async ({ uuid, export_urls }) => {
      try {
        const result = await laravel.setPostImages(uuid, apiToken, export_urls);
        let text = `${result.message}\n\nUUID: \`${result.uuid}\`\n`;
        if (result.images?.length) {
          text += `\nImages:\n` + result.images.map((u: string, i: number) => `  ${i + 1}. ${u}`).join("\n");
        }
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : uuid,
            message: result.message,
            images: Array.isArray(result.images) ? result.images.map(String) : undefined,
          },
        };
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
      outputSchema: postImagesOutput,
      annotations: WRITE_OPEN,
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
        return {
          content: [{ type: "text" as const, text }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : uuid,
            message: result.message,
            image_count: toNum(result.image_count),
            new_images: Array.isArray(result.new_images) ? result.new_images.map(String) : undefined,
            errors: Array.isArray(result.errors) ? result.errors.map(String) : undefined,
          },
        };
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
      outputSchema: postImagesOutput,
      annotations: DESTRUCTIVE_CLOSED,
    },
    async ({ uuid }) => {
      try {
        const result = await laravel.removeImagesFromPost(uuid, apiToken, {});
        return {
          content: [{ type: "text" as const, text:
            `${result.message}\n\nUUID: \`${result.uuid}\`\nFiles deleted from S3: ${result.deleted_count}`
          }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : uuid,
            message: result.message,
            deleted_count: toNum(result.deleted_count),
          },
        };
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
      outputSchema: postDetailOutput,
      annotations: WRITE_OPEN,
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

        return {
          content: [{ type: "text" as const, text:
            `Post scheduled!\n\n` +
            `UUID: \`${result.uuid}\`\n` +
            `Scheduled time (UTC): ${result.scheduled_time_utc}\n` +
            `Platforms: ${platforms.join(", ") || "None"}`
          }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : uuid,
            scheduled_time_utc: result.scheduled_time_utc,
            linkedin_publish: !!result.linkedin_publish,
            instagram_publish: !!result.instagram_publish,
            platforms,
            status: result.status,
          },
        };
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
      outputSchema: postDetailOutput,
      annotations: WRITE_CLOSED,
    },
    async ({ uuid }) => {
      try {
        await laravel.unschedulePost(uuid, apiToken);
        return {
          content: [{ type: "text" as const, text: `Post unscheduled and moved to drafts: \`${uuid}\`` }],
          structuredContent: { uuid, status: "draft", message: `Post unscheduled and moved to drafts: ${uuid}` },
        };
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
      outputSchema: postDetailOutput,
      annotations: DESTRUCTIVE_OPEN,
    },
    async ({ uuid, confirmed, linkedin_publish, instagram_publish, linkedin_account_id, instagram_account_id }) => {
      if (!confirmed) {
        const message =
          "Publishing was not confirmed. Ask the user and name platforms, e.g. " +
          "\"Publish to Instagram only right now? Reply yes to confirm.\"";
        return {
          content: [{ type: "text" as const, text: message }],
          structuredContent: { uuid, message },
        };
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

        const requested = [li && "LinkedIn", ig && "Instagram"].filter(Boolean) as string[];
        return {
          content: [{ type: "text" as const, text:
            `${result.message}\n\n` +
            `UUID: \`${result.uuid}\`\n` +
            `Status: ${result.status}\n` +
            `Platforms requested: ${requested.join(", ")}\n` +
            `Platforms reported: ${result.platforms?.join(", ") || "None"}`
          }],
          structuredContent: {
            uuid: result.uuid != null ? String(result.uuid) : uuid,
            status: result.status,
            message: result.message,
            platforms: result.platforms,
            linkedin_publish: li,
            instagram_publish: ig,
          },
        };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

  return createMcpHandler(server, { route: "/mcp" });
}
