/**
 * Laravel API Client for ContentDrips MCP Server
 * Handles template search, structure, user data, profiles, posts, and social accounts.
 */

export class LaravelClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(endpoint: string, apiKey: string, options?: RequestInit) {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Laravel API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  // =========================================================================
  // TEMPLATES
  // =========================================================================

  async getTemplateCategories(apiKey?: string): Promise<any> {
    return this.request("/api/mcp/templates/categories", apiKey || "");
  }

  async searchTemplates(
    query?: string,
    options?: { type?: string; category?: string; apiKey?: string }
  ): Promise<any> {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (options?.type) params.append("type", options.type);
    if (options?.category) params.append("category", options.category);
    return this.request(`/api/mcp/templates/search?${params.toString()}`, options?.apiKey || "");
  }

  async getMyTemplates(type?: string, apiKey?: string, profileId?: string | number): Promise<any> {
    const params = new URLSearchParams();
    if (type)      params.append("type", type);
    if (profileId) params.append("profile_id", String(profileId));
    return this.request(`/api/mcp/my-templates?${params.toString()}`, apiKey || "");
  }

  async deleteGraphic(templateId: string | number, apiKey: string): Promise<any> {
    return this.request(`/api/mcp/graphics/${templateId}`, apiKey, { method: "DELETE" });
  }

  async runAIDesignAgent(templateId: string | number, apiKey: string, data: {
    prompt: string;
    use_branding?: boolean;
    conversation_history?: Array<{ role: string; content: string }>;
    style_id?: string;
    model?: "basic" | "pro";
  }): Promise<any> {
    return this.request(`/api/mcp/graphics/${templateId}/ai-design`, apiKey, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getBrandStyles(apiKey: string, profileId?: string | number): Promise<any> {
    const params = new URLSearchParams();
    if (profileId) params.append("profile_id", String(profileId));
    const qs = params.toString();
    return this.request(`/api/mcp/brand-styles${qs ? `?${qs}` : ""}`, apiKey);
  }

  async createGraphic(apiKey: string, data: {
    name: string;
    type: string;
    format?: string;
    width?: number;
    height?: number;
    slides?: number;
    profile_id?: number | string;
  }): Promise<any> {
    return this.request("/api/mcp/graphics", apiKey, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async findTemplate(params: { id?: string | number; name?: string }, apiKey: string): Promise<any> {
    const qs = new URLSearchParams();
    if (params.id)   qs.append("id",   String(params.id));
    if (params.name) qs.append("name", params.name);
    return this.request(`/api/mcp/templates/find?${qs.toString()}`, apiKey);
  }

  async getTemplateStructure(templateId: string, apiKey?: string): Promise<any> {
    return this.request(`/api/mcp/templates/${templateId}/structure`, apiKey || "");
  }

  async getMe(apiKey: string): Promise<any> {
    return this.request("/api/mcp/me", apiKey);
  }

  // =========================================================================
  // PROFILES & SOCIAL ACCOUNTS
  // =========================================================================

  async getProfiles(apiKey: string): Promise<any> {
    return this.request("/api/mcp/profiles", apiKey);
  }

  async getSocialAccounts(profileId: string | number, apiKey: string): Promise<any> {
    return this.request(`/api/mcp/profiles/${profileId}/social-accounts`, apiKey);
  }

  // =========================================================================
  // POSTS CRUD
  // =========================================================================

  async listPosts(apiKey: string, status?: string): Promise<any> {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    return this.request(`/api/mcp/posts?${params.toString()}`, apiKey);
  }

  async getPost(uuid: string, apiKey: string): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}`, apiKey);
  }

  async createPost(
    apiKey: string,
    data: { caption: string; profile_id?: number; images_url?: string[]; graphic_id?: number }
  ): Promise<any> {
    return this.request("/api/mcp/posts", apiKey, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updatePost(
    uuid: string,
    apiKey: string,
    data: {
      caption?: string;
      linkedin_publish?: boolean;
      instagram_publish?: boolean;
      linkedin_account_id?: number;
      instagram_account_id?: number;
    }
  ): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}`, apiKey, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deletePost(uuid: string, apiKey: string): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}`, apiKey, {
      method: "DELETE",
    });
  }

  // =========================================================================
  // POST IMAGE ACTIONS
  // =========================================================================

  /** Case 1: set ContentDrips export_urls on a post (no re-upload). */
  async setPostImages(uuid: string, apiKey: string, exportUrls: string[]): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}/set-images`, apiKey, {
      method: "POST",
      body: JSON.stringify({ export_urls: exportUrls }),
    });
  }

  /** Case 2: upload external images (URLs or base64) to S3 and attach to post. */
  async uploadImagesToPost(
    uuid: string,
    apiKey: string,
    data: { image_urls?: string[]; images_base64?: string[] }
  ): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}/upload-images`, apiKey, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Remove all images from a post (deletes from S3 and clears images_url + graphic_id). */
  async removeImagesFromPost(uuid: string, apiKey: string, _data: {}): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}/images`, apiKey, {
      method: "DELETE",
    });
  }

  async schedulePost(
    uuid: string,
    apiKey: string,
    data: {
      scheduled_time: string;
      timezone: string;
      linkedin_publish?: boolean;
      instagram_publish?: boolean;
      linkedin_account_id?: number;
      instagram_account_id?: number;
    }
  ): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}/schedule`, apiKey, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async unschedulePost(uuid: string, apiKey: string): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}/unschedule`, apiKey, {
      method: "POST",
    });
  }

  async publishPost(
    uuid: string,
    apiKey: string,
    data: {
      linkedin_publish?: boolean;
      instagram_publish?: boolean;
      linkedin_account_id?: number;
      instagram_account_id?: number;
    }
  ): Promise<any> {
    return this.request(`/api/mcp/posts/${uuid}/publish`, apiKey, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }
}
