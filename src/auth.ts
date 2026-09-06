/**
 * OAuth 2.0 Authorization Code flow for ContentDrips MCP Server.
 *
 * Authorization UI lives on the Vue app (app.contentdrips.com/mcp/auth).
 * GET /authorize on this Worker 302s there. The API key IS the OAuth token —
 * no KV or Durable Object storage is needed.
 */

export interface OAuthEnv {
  LARAVEL_API_URL: string;
  APP_URL: string;
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export function buildDiscoveryResponse(baseUrl: string): Response {
  return jsonResponse({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: ["mcp"],
    service_documentation: "https://contentdrips.com/docs/mcp",
  });
}

// ─── Authorization redirect ───────────────────────────────────────────────────

const OAUTH_QUERY_KEYS = [
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
  "client_id",
  "response_type",
  "scope",
] as const;

export function buildAuthorizeRedirect(appUrl: string, searchParams: URLSearchParams): Response {
  const dest = new URL("/mcp/auth", appUrl.replace(/\/$/, ""));
  for (const key of OAUTH_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) dest.searchParams.set(key, value);
  }
  return Response.redirect(dest.toString(), 302);
}

// ─── Token Endpoint ───────────────────────────────────────────────────────────

export function buildTokenResponse(apiKey: string): Response {
  return jsonResponse({
    access_token: apiKey,
    token_type: "bearer",
    scope: "mcp",
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
