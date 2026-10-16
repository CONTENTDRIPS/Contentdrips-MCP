import { describe, expect, it } from "vitest";
import {
  buildProtectedResourceMetadata,
  buildWwwAuthenticate,
  handleOAuthComplete,
  handleTokenRequest,
  isProtectedResourceMetadataPath,
  s256Challenge,
  type OAuthEnv,
} from "./auth";

class MemoryKV {
  private map = new Map<string, string>();
  async get(key: string) {
    return this.map.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.map.set(key, value);
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

function env(): OAuthEnv {
  return {
    LARAVEL_API_URL: "https://api.contentdrips.com",
    APP_URL: "https://app.contentdrips.com",
    OAUTH_SIGNING_SECRET: "test-secret",
    OAUTH_PKCE: new MemoryKV() as unknown as KVNamespace,
  };
}

async function pkcePair() {
  const verifier = "a".repeat(64);
  return { verifier, challenge: await s256Challenge(verifier) };
}

describe("OAuth metadata", () => {
  it("sets resource to the /mcp URL", () => {
    const meta = buildProtectedResourceMetadata("https://mcp.contentdrips.com");
    expect(meta.resource).toBe("https://mcp.contentdrips.com/mcp");
    expect(meta.authorization_servers).toEqual(["https://mcp.contentdrips.com"]);
  });

  it("serves root and path-suffixed PRM paths", () => {
    expect(isProtectedResourceMetadataPath("/.well-known/oauth-protected-resource")).toBe(true);
    expect(isProtectedResourceMetadataPath("/.well-known/oauth-protected-resource/mcp")).toBe(true);
    expect(isProtectedResourceMetadataPath("/.well-known/oauth-authorization-server")).toBe(false);
  });

  it("points WWW-Authenticate at the path-suffixed PRM", () => {
    expect(buildWwwAuthenticate("https://mcp.contentdrips.com")).toContain(
      "resource_metadata=\"https://mcp.contentdrips.com/.well-known/oauth-protected-resource/mcp\""
    );
  });
});

describe("PKCE token exchange", () => {
  it("issues a signed code and verifies S256 on /token", async () => {
    const { verifier, challenge } = await pkcePair();
    const complete = await handleOAuthComplete(
      new Request(
        `https://mcp.contentdrips.com/oauth/complete?api_key=cd_test_key&redirect_uri=https://claude.ai/api/mcp/auth_callback&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`
      ),
      env(),
      "https://mcp.contentdrips.com"
    );
    expect(complete.status).toBe(302);
    const location = new URL(complete.headers.get("Location") || "");
    const code = location.searchParams.get("code");
    expect(code?.startsWith("cd1.")).toBe(true);
    expect(location.searchParams.get("state")).toBe("xyz");

    const token = await handleTokenRequest(
      new Request("https://mcp.contentdrips.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: code!,
          code_verifier: verifier,
        }),
      }),
      env(),
      "https://mcp.contentdrips.com"
    );
    expect(token.status).toBe(200);
    const body = await token.json() as Record<string, unknown>;
    expect(body.access_token).toBe("cd_test_key");
    expect(body.expires_in).toBe(86400);
    expect(typeof body.refresh_token).toBe("string");
  });

  it("accepts a legacy API-key code without a stored PKCE challenge", async () => {
    const { verifier } = await pkcePair();
    const token = await handleTokenRequest(
      new Request("https://mcp.contentdrips.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "legacy_api_key",
          code_verifier: verifier,
        }),
      }),
      env(),
      "https://mcp.contentdrips.com"
    );
    expect(token.status).toBe(200);
    const body = await token.json() as Record<string, unknown>;
    expect(body.access_token).toBe("legacy_api_key");
  });

  it("rejects a missing or wrong code_verifier on signed codes", async () => {
    const { challenge } = await pkcePair();
    const complete = await handleOAuthComplete(
      new Request(
        `https://mcp.contentdrips.com/oauth/complete?api_key=cd_test_key&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_challenge=${challenge}&code_challenge_method=S256`
      ),
      env(),
      "https://mcp.contentdrips.com"
    );
    const code = new URL(complete.headers.get("Location") || "").searchParams.get("code")!;

    const missing = await handleTokenRequest(
      new Request("https://mcp.contentdrips.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code }),
      }),
      env(),
      "https://mcp.contentdrips.com"
    );
    expect(missing.status).toBe(400);

    const wrong = await handleTokenRequest(
      new Request("https://mcp.contentdrips.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: "b".repeat(64),
        }),
      }),
      env(),
      "https://mcp.contentdrips.com"
    );
    expect(wrong.status).toBe(400);
  });

  it("refreshes an access token", async () => {
    const { verifier, challenge } = await pkcePair();
    const oauthEnv = env();
    const complete = await handleOAuthComplete(
      new Request(
        `https://mcp.contentdrips.com/oauth/complete?api_key=cd_test_key&redirect_uri=https://claude.ai/api/mcp/auth_callback&code_challenge=${challenge}&code_challenge_method=S256`
      ),
      oauthEnv,
      "https://mcp.contentdrips.com"
    );
    const code = new URL(complete.headers.get("Location") || "").searchParams.get("code")!;
    const first = await handleTokenRequest(
      new Request("https://mcp.contentdrips.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: verifier,
        }),
      }),
      oauthEnv,
      "https://mcp.contentdrips.com"
    );
    const issued = await first.json() as { refresh_token: string };

    const refreshed = await handleTokenRequest(
      new Request("https://mcp.contentdrips.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: issued.refresh_token,
        }),
      }),
      oauthEnv,
      "https://mcp.contentdrips.com"
    );
    expect(refreshed.status).toBe(200);
    const body = await refreshed.json() as Record<string, unknown>;
    expect(body.access_token).toBe("cd_test_key");
  });
});
