/**
 * Node.js Renderer API Client for ContentDrips MCP Server
 * Handles carousel and graphic generation operations.
 */

interface GenerateAiCarouselParams {
  template_id: string;
  method: "topic" | "blog" | "youtube" | "tiktok_reel";
  input: string;
  output?: "png" | "pdf";
  api_key: string;
  profile_id: string;
}

interface GenerateAiGraphicParams {
  template_id: string;
  method: "topic" | "blog" | "youtube" | "tiktok_reel";
  input: string;
  output?: "png" | "pdf";
  api_key: string;
  profile_id: string;
}

interface GenerateCarouselParams {
  template_id: string;
  carousel: any;
  branding?: any;
  output?: "png" | "pdf";
  api_key: string;
  profile_id: string;
}

interface GenerateGraphicParams {
  template_id: string;
  content_update: any[];
  branding?: any;
  output?: "png" | "pdf";
  api_key: string;
  profile_id: string;
}

export class RendererClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
  }

  private async request(endpoint: string, apiKey: string, body: any) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Renderer API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  /**
   * Generate AI carousel from topic or URL.
   */
  async generateAiCarousel(params: GenerateAiCarouselParams): Promise<any> {
    return this.request("/render?tool=carousel-maker", params.api_key, {
      template_id: params.template_id,
      token: params.api_key,
      profile_id: params.profile_id,
      tool: "carousel-maker",
      output: params.output || "png",
      ai_carousel: {
        method: params.method,
        input: params.input,
      },
    });
  }

  /**
   * Generate AI graphic from topic or URL.
   */
  async generateAiGraphic(params: GenerateAiGraphicParams): Promise<any> {
    return this.request("/render", params.api_key, {
      template_id: params.template_id,
      token: params.api_key,
      profile_id: params.profile_id,
      output: params.output || "png",
      ai_graphic: {
        method: params.method,
        input: params.input,
      },
    });
  }

  /**
   * Generate carousel with custom JSON content.
   */
  async generateCarousel(params: GenerateCarouselParams): Promise<any> {
    return this.request("/render?tool=carousel-maker", params.api_key, {
      template_id: params.template_id,
      token: params.api_key,
      profile_id: params.profile_id,
      tool: "carousel-maker",
      output: params.output || "png",
      carousel: params.carousel,
      branding: params.branding,
    });
  }

  /**
   * Generate graphic with custom content_update.
   */
  async generateGraphic(params: GenerateGraphicParams): Promise<any> {
    return this.request("/render", params.api_key, {
      template_id: params.template_id,
      token: params.api_key,
      profile_id: params.profile_id,
      output: params.output || "png",
      content_update: params.content_update,
      branding: params.branding,
    });
  }

  /**
   * Check job status and get output URLs.
   */
  async checkJobStatus(jobId: string, apiKey: string): Promise<any> {
    // /status gives processing state; /result gives final export_url once complete.
    // We call /result which returns the export_url when the job is done.
    const url = `${this.baseUrl}/job/${jobId}/result`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Renderer API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }
}
