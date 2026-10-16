import { createContentDripsMcpHandler } from "./mcp";
import {
  buildAuthorizeRedirect,
  buildDiscoveryResponse,
  buildProtectedResourceMetadata,
  buildWwwAuthenticate,
  handleOAuthComplete,
  handleTokenRequest,
  isProtectedResourceMetadataPath,
  rememberAuthorizeChallenge,
  type OAuthEnv,
} from "./auth";

export interface Env extends OAuthEnv {
  LARAVEL_API_URL: string;
  RENDERER_API_URL: string;
  APP_URL: string;
}

function isMcpPath(pathname: string): boolean {
  return pathname === "/mcp" || pathname === "/mcp/" || pathname === "/sse" || pathname === "/sse/";
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

    // ── RFC 9728 Protected Resource Metadata (root + /mcp path suffix) ─────────
    if (isProtectedResourceMetadataPath(url.pathname)) {
      return jsonResponse(buildProtectedResourceMetadata(baseUrl));
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
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          code_challenge_methods_supported: ["S256"],
        },
        201
      );
    }

    // ── Authorization — GET (store PKCE, redirect to Vue consent page) ────────
    if (url.pathname === "/authorize" && request.method === "GET") {
      const appUrl = env.APP_URL || "https://app.contentdrips.com";
      await rememberAuthorizeChallenge(env, url.searchParams);
      return buildAuthorizeRedirect(appUrl, baseUrl, url.searchParams);
    }

    // ── Consent complete — Vue posts the API key, we issue a signed code ──────
    if (url.pathname === "/oauth/complete" && (request.method === "GET" || request.method === "POST")) {
      return handleOAuthComplete(request, env, baseUrl);
    }

    // ── Token exchange ────────────────────────────────────────────────────────
    if (url.pathname === "/token" && request.method === "POST") {
      return handleTokenRequest(request, env, baseUrl);
    }

    // ── MCP endpoint (Bearer header only — no tokens in the URL) ──────────────
    if (isMcpPath(url.pathname)) {
      let apiToken: string | null = null;
      const authHeader = request.headers.get("Authorization");
      if (authHeader?.startsWith("Bearer ")) {
        apiToken = authHeader.slice(7).trim();
      }

      if (!apiToken) {
        return new Response(
          JSON.stringify({ error: "unauthorized", message: "Authentication required" }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
              "WWW-Authenticate": buildWwwAuthenticate(baseUrl),
            },
          }
        );
      }

      const handler = createContentDripsMcpHandler(apiToken, env);
      return handler(request, env, ctx);
    }

    return new Response("Not Found", { status: 404 });
  },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
