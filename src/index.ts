import { createContentDripsMcpHandler } from "./mcp";
import {
  buildDiscoveryResponse,
  buildTokenResponse,
  renderAuthorizePage,
  validateApiKey,
} from "./auth";

export interface Env {
  LARAVEL_API_URL: string;
  RENDERER_API_URL: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    // ── CORS preflight ────────────────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
        },
      });
    }

    // ── Health ────────────────────────────────────────────────────────────────
    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({
        name: "ContentDrips MCP Server",
        version: "1.0.0",
        status: "healthy",
        mcp_url: `${baseUrl}/mcp`,
      });
    }

    // ── OpenAI ChatGPT plugin domain verification ─────────────────────────────
    // Must be public (no auth) and return only the exact token as text/plain.
    // https://developers.openai.com/plugins/deploy/submission#domain-verification
    if (url.pathname === "/.well-known/openai-apps-challenge") {
      return new Response("ipscc3gfeu-I9JTCefiKr37ZvX_x43YqAGbGFprR4N0", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      });
    }

    // ── RFC 9728 Protected Resource Metadata ──────────────────────────────────
    if (url.pathname === "/.well-known/oauth-protected-resource") {
      return jsonResponse({
        resource: baseUrl,
        authorization_servers: [baseUrl],
        bearer_methods_supported: ["header"],
        scopes_supported: ["mcp"],
      });
    }

    // ── RFC 8414 Authorization Server Metadata ────────────────────────────────
    if (
      url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname === "/.well-known/openid-configuration"
    ) {
      return buildDiscoveryResponse(baseUrl);
    }

    // ── RFC 7591 Dynamic Client Registration ──────────────────────────────────
    if (url.pathname === "/register" && request.method === "POST") {
      let body: any = {};
      try { body = await request.json(); } catch {}
      const redirectUri = (body.redirect_uris?.[0] || "unknown").toString();
      const clientId = btoa(redirectUri).replace(/[^a-zA-Z0-9]/g, "").slice(0, 32);
      return jsonResponse(
        {
          client_id: clientId,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          redirect_uris: body.redirect_uris || [],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
        201
      );
    }

    // ── Authorization — GET (show form) ───────────────────────────────────────
    if (url.pathname === "/authorize" && request.method === "GET") {
      return renderAuthorizePage({
        redirectUri: url.searchParams.get("redirect_uri") || "",
        state: url.searchParams.get("state") || "",
        codeChallenge: url.searchParams.get("code_challenge") || "",
        codeChallengeMethod: url.searchParams.get("code_challenge_method") || "",
      });
    }

    // ── Authorization — POST (form submit) ────────────────────────────────────
    if (url.pathname === "/authorize" && request.method === "POST") {
      const formData = await request.formData();
      const apiKey = ((formData.get("api_key") as string) || "").trim();
      const redirectUri = ((formData.get("redirect_uri") as string) || "").trim();
      const state = ((formData.get("state") as string) || "").trim();
      const codeChallenge = ((formData.get("code_challenge") as string) || "").trim();
      const codeChallengeMethod = ((formData.get("code_challenge_method") as string) || "").trim();

      if (!apiKey) {
        return renderAuthorizePage({ redirectUri, state, codeChallenge, codeChallengeMethod, error: "Please enter your ContentDrips API key." });
      }

      const { valid, message } = await validateApiKey(apiKey, env.LARAVEL_API_URL);
      if (!valid) {
        return renderAuthorizePage({
          redirectUri, state, codeChallenge, codeChallengeMethod,
          error: message || "Invalid API key. Please check and try again.",
        });
      }

      // Use the API key as the auth code directly — no storage needed
      const redirect = new URL(redirectUri);
      redirect.searchParams.set("code", apiKey);
      if (state) redirect.searchParams.set("state", state);
      return Response.redirect(redirect.toString(), 302);
    }

    // ── Token exchange ────────────────────────────────────────────────────────
    if (url.pathname === "/token" && request.method === "POST") {
      let code: string | null = null;
      const contentType = request.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = (await request.json()) as { code?: string };
        code = body.code || null;
      } else {
        const form = await request.formData();
        code = form.get("code") as string | null;
      }

      if (!code) {
        return jsonResponse({ error: "invalid_grant", error_description: "Missing code" }, 400);
      }

      // The code IS the ContentDrips API key (validated during /authorize step).
      // No need to re-validate here — just return it as the access token.
      return buildTokenResponse(code);
    }

    // ── MCP SSE endpoint ──────────────────────────────────────────────────────
    if (url.pathname.startsWith("/mcp") || url.pathname.startsWith("/sse")) {
      // Extract token from: 1) Authorization: Bearer header, 2) URL path, 3) ?token= param
      let apiToken: string | null = null;

      const authHeader = request.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        apiToken = authHeader.slice(7).trim();
      }
      if (!apiToken) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (parts.length >= 2 && (parts[0] === "mcp" || parts[0] === "sse")) {
          apiToken = parts[1];
        }
      }
      if (!apiToken) {
        apiToken = url.searchParams.get("token");
      }

      if (!apiToken) {
        return new Response(
          JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              // This header tells Claude.ai where to find the OAuth flow
              "WWW-Authenticate": `Bearer realm="ContentDrips MCP", resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
            },
          }
        );
      }

      // Stateless handler — token is a closure variable, no Durable Objects needed.
      const handler = createContentDripsMcpHandler(apiToken, env);
      return handler(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
