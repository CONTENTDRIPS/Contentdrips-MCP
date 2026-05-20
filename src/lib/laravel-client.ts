/**
 * Laravel API Client for ContentDrips MCP Server
 * Handles template search, structure, and user data operations.
 */

export class LaravelClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
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

  /**
   * Search public templates by keyword.
   */
  async searchTemplates(query: string, type?: string, apiKey?: string): Promise<any> {
    const params = new URLSearchParams();
    if (query) params.append("q", query);
    if (type) params.append("type", type);

    return this.request(`/api/mcp/templates/search?${params.toString()}`, apiKey || "");
  }

  /**
   * Get user's own saved templates.
   */
  async getMyTemplates(type?: string, apiKey?: string): Promise<any> {
    const params = new URLSearchParams();
    if (type) params.append("type", type);

    return this.request(`/api/mcp/my-templates?${params.toString()}`, apiKey || "");
  }

  /**
   * Get template structure (content_update fields, carousel structure, branding).
   */
  async getTemplateStructure(templateId: string, apiKey?: string): Promise<any> {
    return this.request(`/api/mcp/templates/${templateId}/structure`, apiKey || "");
  }

  /**
   * Get current user info and AI credits.
   */
  async getMe(apiKey: string): Promise<any> {
    return this.request("/api/mcp/me", apiKey);
  }
}
