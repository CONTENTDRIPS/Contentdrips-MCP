/**
 * OAuth 2.0 Authorization Code flow for ContentDrips MCP Server.
 *
 * Since ContentDrips already has API keys, we use them directly as access tokens.
 * The "authorization" step is simply asking the user to paste their API key,
 * validating it against the Laravel backend, then returning it as the OAuth token.
 *
 * No KV or Durable Object storage is needed — the API key IS the token.
 */

export interface OAuthEnv {
  LARAVEL_API_URL: string;
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

// ─── Authorization Endpoint ───────────────────────────────────────────────────

export function renderAuthorizePage(params: {
  redirectUri: string;
  state: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  error?: string;
}): Response {
  const errorHtml = params.error
    ? `<div class="error">${params.error}</div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connect ContentDrips</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f0f0f;
      color: #e8e8e8;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }

    .card {
      background: #1a1a1a;
      border: 1px solid #2a2a2a;
      border-radius: 16px;
      padding: 48px 40px;
      width: 100%;
      max-width: 420px;
      text-align: center;
    }

    .logo {
      width: 64px;
      height: 64px;
      background: #3B5BDB;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
      font-size: 28px;
      font-weight: 700;
      color: #fff;
      letter-spacing: -1px;
    }

    h1 {
      font-size: 22px;
      font-weight: 600;
      color: #fff;
      margin-bottom: 8px;
    }

    p.subtitle {
      font-size: 14px;
      color: #888;
      margin-bottom: 32px;
      line-height: 1.5;
    }

    .input-group {
      text-align: left;
      margin-bottom: 20px;
    }

    label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: #ccc;
      margin-bottom: 8px;
    }

    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 12px 14px;
      background: #111;
      border: 1px solid #333;
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      font-family: "SF Mono", "Monaco", monospace;
      outline: none;
      transition: border-color 0.15s;
    }

    input:focus {
      border-color: #3B5BDB;
    }

    .help-text {
      font-size: 12px;
      color: #666;
      margin-top: 6px;
    }

    .help-text a {
      color: #5C7CFA;
      text-decoration: none;
    }

    button {
      width: 100%;
      padding: 13px;
      background: #3B5BDB;
      color: #fff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      margin-top: 8px;
    }

    button:hover { background: #4C6EF5; }
    button:active { background: #2F4AC2; }

    .error {
      background: #2d1515;
      border: 1px solid #5c2020;
      color: #ff8080;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 13px;
      margin-bottom: 20px;
      text-align: left;
    }

    .divider {
      border: none;
      border-top: 1px solid #2a2a2a;
      margin: 28px 0;
    }

    .footer {
      font-size: 12px;
      color: #555;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">cd</div>
    <h1>Connect ContentDrips</h1>
    <p class="subtitle">
      Enter your ContentDrips API key to give this AI assistant
      access to generate carousels and graphics.
    </p>

    ${errorHtml}

    <form method="POST" action="/authorize">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}" />
      <input type="hidden" name="state" value="${escapeHtml(params.state)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge || '')}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod || '')}" />

      <div class="input-group">
        <label for="api_key">ContentDrips API Key</label>
        <input
          type="password"
          id="api_key"
          name="api_key"
          placeholder="cd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          autocomplete="off"
          spellcheck="false"
          required
        />
        <p class="help-text">
          Find your key in <a href="https://app.contentdrips.com" target="_blank">ContentDrips → API Settings</a>
        </p>
      </div>

      <button type="submit">Connect</button>
    </form>

    <hr class="divider" />
    <p class="footer">
      Your key is validated and never stored on our servers.
    </p>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ─── Token Validation ─────────────────────────────────────────────────────────

export async function validateApiKey(
  apiKey: string,
  laravelUrl: string
): Promise<{ valid: boolean; message?: string }> {
  try {
    const response = await fetch(`${laravelUrl}/api/validate-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json() as { valid: boolean; message?: string };
    return { valid: !!data.valid, message: data.message };
  } catch {
    return { valid: false, message: "Could not reach ContentDrips servers." };
  }
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
