/**
 * OAuth 2.0 Authorization Code + PKCE (S256) for ContentDrips MCP.
 *
 * Consent UI lives on the Vue app (app.contentdrips.com/mcp/auth).
 * GET /authorize stores the PKCE challenge, then 302s there.
 * GET/POST /oauth/complete issues a signed authorization code (preferred).
 * The live Vue consent page still returns the API key as `code`. That path
 * must succeed even when PKCE state is missing (Cache is per-colo; no KV).
 */

export interface OAuthEnv {
  LARAVEL_API_URL: string;
  APP_URL: string;
  OAUTH_SIGNING_SECRET?: string;
  OAUTH_PKCE?: KVNamespace;
}

const AUTH_CODE_PREFIX = "cd1.";
const REFRESH_PREFIX = "cdrt.";
const PKCE_TTL_SEC = 600;
const ACCESS_TTL_SEC = 86400;
const REFRESH_TTL_SEC = 30 * 24 * 3600;

export function mcpResourceUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/mcp`;
}

export function buildProtectedResourceMetadata(baseUrl: string) {
  const resource = mcpResourceUrl(baseUrl);
  return {
    resource,
    authorization_servers: [baseUrl.replace(/\/$/, "")],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  };
}

export function buildWwwAuthenticate(baseUrl: string): string {
  const origin = baseUrl.replace(/\/$/, "");
  return `Bearer realm="ContentDrips MCP", resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`;
}

export function isProtectedResourceMetadataPath(pathname: string): boolean {
  return (
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/.well-known/oauth-protected-resource/mcp"
  );
}

export function buildDiscoveryResponse(baseUrl: string): Response {
  const origin = baseUrl.replace(/\/$/, "");
  return jsonResponse({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    token_endpoint_auth_methods_supported: ["none"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp", "offline_access"],
    service_documentation: "https://contentdrips.com/mcp/",
  });
}

const OAUTH_QUERY_KEYS = [
  "redirect_uri",
  "state",
  "code_challenge",
  "code_challenge_method",
  "client_id",
  "response_type",
  "scope",
] as const;

export async function rememberAuthorizeChallenge(
  env: OAuthEnv,
  searchParams: URLSearchParams
): Promise<void> {
  const challenge = searchParams.get("code_challenge");
  const method = (searchParams.get("code_challenge_method") || "S256").toUpperCase();
  if (!challenge) return;
  if (method !== "S256") return;
  await storePkceChallenge(env, challenge);
}

export function buildAuthorizeRedirect(
  appUrl: string,
  mcpBaseUrl: string,
  searchParams: URLSearchParams
): Response {
  const dest = new URL("/mcp/auth", appUrl.replace(/\/$/, ""));
  for (const key of OAUTH_QUERY_KEYS) {
    const value = searchParams.get(key);
    if (value) dest.searchParams.set(key, value);
  }
  dest.searchParams.set("complete_uri", `${mcpBaseUrl.replace(/\/$/, "")}/oauth/complete`);
  return Response.redirect(dest.toString(), 302);
}

export async function handleOAuthComplete(
  request: Request,
  env: OAuthEnv,
  mcpBaseUrl: string
): Promise<Response> {
  const params = await readParams(request);
  const apiKey = (params.get("api_key") || params.get("code") || "").trim();
  const redirectUri = params.get("redirect_uri");
  const state = params.get("state");
  const challenge = params.get("code_challenge");
  const method = (params.get("code_challenge_method") || "S256").toUpperCase();

  if (!apiKey) {
    return jsonResponse({ error: "invalid_request", error_description: "Missing api_key" }, 400);
  }
  if (!redirectUri) {
    return jsonResponse({ error: "invalid_request", error_description: "Missing redirect_uri" }, 400);
  }
  if (!challenge || method !== "S256") {
    return jsonResponse(
      { error: "invalid_request", error_description: "S256 code_challenge is required" },
      400
    );
  }

  await storePkceChallenge(env, challenge);
  const code = await issueSignedAuthCode(env, mcpBaseUrl, {
    apiKey,
    challenge,
    exp: Math.floor(Date.now() / 1000) + PKCE_TTL_SEC,
  });

  const dest = new URL(redirectUri);
  dest.searchParams.set("code", code);
  if (state) dest.searchParams.set("state", state);
  return Response.redirect(dest.toString(), 302);
}

export async function handleTokenRequest(
  request: Request,
  env: OAuthEnv,
  mcpBaseUrl: string
): Promise<Response> {
  const params = await readParams(request);
  const grantType = params.get("grant_type") || "authorization_code";

  if (grantType === "refresh_token") {
    const refresh = params.get("refresh_token");
    if (!refresh) {
      return jsonResponse({ error: "invalid_request", error_description: "Missing refresh_token" }, 400);
    }
    const apiKey = await verifyRefreshToken(env, mcpBaseUrl, refresh);
    if (!apiKey) {
      return jsonResponse({ error: "invalid_grant", error_description: "Invalid refresh token" }, 400);
    }
    return buildTokenResponse(env, mcpBaseUrl, apiKey);
  }

  if (grantType !== "authorization_code") {
    return jsonResponse({ error: "unsupported_grant_type" }, 400);
  }

  const code = params.get("code");
  const verifier = params.get("code_verifier");
  if (!code) {
    return jsonResponse({ error: "invalid_grant", error_description: "Missing code" }, 400);
  }

  const signed = await parseSignedAuthCode(env, mcpBaseUrl, code);
  if (signed) {
    if (!verifier) {
      return jsonResponse(
        { error: "invalid_request", error_description: "PKCE code_verifier is required" },
        400
      );
    }
    const expectedChallenge = await s256Challenge(verifier);
    if (signed.challenge !== expectedChallenge) {
      return jsonResponse({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
    }
    await consumePkceChallenge(env, expectedChallenge);
    return buildTokenResponse(env, mcpBaseUrl, signed.apiKey);
  }

  // Live Vue consent: the authorization code IS the ContentDrips API key.
  // ChatGPT/Claude send a PKCE verifier, but we cannot require a stored
  // challenge — authorize and token often hit different Worker colos.
  return buildTokenResponse(env, mcpBaseUrl, code);
}

export async function buildTokenResponse(
  env: OAuthEnv,
  mcpBaseUrl: string,
  apiKey: string
): Promise<Response> {
  const refresh_token = await issueRefreshToken(env, mcpBaseUrl, apiKey);
  return jsonResponse({
    access_token: apiKey,
    token_type: "bearer",
    expires_in: ACCESS_TTL_SEC,
    refresh_token,
    scope: "mcp offline_access",
  });
}

export async function s256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

// ─── PKCE store (KV, then Cache API) ──────────────────────────────────────────

async function storePkceChallenge(env: OAuthEnv, challenge: string): Promise<void> {
  const value = JSON.stringify({ exp: Date.now() + PKCE_TTL_SEC * 1000 });
  if (env.OAUTH_PKCE) {
    await env.OAUTH_PKCE.put(`pkce:${challenge}`, value, { expirationTtl: PKCE_TTL_SEC });
  }
  try {
    await caches.default.put(
      new Request(`https://pkce.internal/${challenge}`),
      new Response(value, { headers: { "Cache-Control": `max-age=${PKCE_TTL_SEC}` } })
    );
  } catch {
    // Cache API is unavailable in some test / local runtimes.
  }
}

async function consumePkceChallenge(env: OAuthEnv, challenge: string): Promise<boolean> {
  if (env.OAUTH_PKCE) {
    const hit = await env.OAUTH_PKCE.get(`pkce:${challenge}`);
    if (hit) {
      await env.OAUTH_PKCE.delete(`pkce:${challenge}`);
      return true;
    }
  }
  try {
    const req = new Request(`https://pkce.internal/${challenge}`);
    const cached = await caches.default.match(req);
    if (cached) {
      await caches.default.delete(req);
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// ─── Signed codes / refresh tokens ────────────────────────────────────────────

interface SignedAuthCode {
  apiKey: string;
  challenge: string;
  exp: number;
}

async function issueSignedAuthCode(
  env: OAuthEnv,
  mcpBaseUrl: string,
  payload: SignedAuthCode
): Promise<string> {
  return signBlob(env, mcpBaseUrl, AUTH_CODE_PREFIX, payload);
}

async function parseSignedAuthCode(
  env: OAuthEnv,
  mcpBaseUrl: string,
  code: string
): Promise<SignedAuthCode | null> {
  const data = await verifyBlob<SignedAuthCode>(env, mcpBaseUrl, AUTH_CODE_PREFIX, code);
  if (!data?.apiKey || !data.challenge) return null;
  if (data.exp < Math.floor(Date.now() / 1000)) return null;
  return data;
}

async function issueRefreshToken(env: OAuthEnv, mcpBaseUrl: string, apiKey: string): Promise<string> {
  return signBlob(env, mcpBaseUrl, REFRESH_PREFIX, {
    apiKey,
    exp: Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC,
  });
}

async function verifyRefreshToken(
  env: OAuthEnv,
  mcpBaseUrl: string,
  token: string
): Promise<string | null> {
  const data = await verifyBlob<{ apiKey: string; exp: number }>(
    env,
    mcpBaseUrl,
    REFRESH_PREFIX,
    token
  );
  if (!data?.apiKey) return null;
  if (data.exp < Math.floor(Date.now() / 1000)) return null;
  return data.apiKey;
}

function signingSecret(env: OAuthEnv, mcpBaseUrl: string): string {
  return env.OAUTH_SIGNING_SECRET || `contentdrips-mcp:${mcpBaseUrl}`;
}

async function signBlob(
  env: OAuthEnv,
  mcpBaseUrl: string,
  prefix: string,
  payload: unknown
): Promise<string> {
  const body = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const mac = await hmacHex(signingSecret(env, mcpBaseUrl), body);
  return `${prefix}${body}.${mac}`;
}

async function verifyBlob<T>(
  env: OAuthEnv,
  mcpBaseUrl: string,
  prefix: string,
  token: string
): Promise<T | null> {
  if (!token.startsWith(prefix)) return null;
  const rest = token.slice(prefix.length);
  const dot = rest.lastIndexOf(".");
  if (dot < 0) return null;
  const body = rest.slice(0, dot);
  const mac = rest.slice(dot + 1);
  const expected = await hmacHex(signingSecret(env, mcpBaseUrl), body);
  if (!timingSafeEqual(mac, expected)) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as T;
  } catch {
    return null;
  }
}

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function readParams(request: Request): Promise<URLSearchParams> {
  if (request.method === "GET") {
    return new URL(request.url).searchParams;
  }
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value != null) params.set(key, String(value));
    }
    return params;
  }
  const text = await request.text();
  return new URLSearchParams(text);
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
