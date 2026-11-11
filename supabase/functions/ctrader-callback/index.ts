const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "Pragma": "no-cache",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
};

const page = (title: string, message: string, status = 200) => new Response(
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font:16px system-ui;background:#0b1020;color:#fff;display:grid;min-height:90vh;place-items:center"><main style="max-width:540px;padding:28px"><h2>${title}</h2><p>${message}</p><p>You can close this window and return to SuperTech AI.</p></main></body></html>`,
  { status, headers }
);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

const encrypt = async (plain: string, keyText: string) => {
  const raw = Uint8Array.from(atob(keyText), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1.${b64(iv)}.${b64(new Uint8Array(cipher))}`;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET") return page("Invalid request", "Unsupported request method.", 405);

  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const oauthError = u.searchParams.get("error");

  if (!state || state.length > 256 || (code && code.length > 2048)) {
    return page("Invalid authorisation response", "The callback was incomplete. Start again from SuperTech AI.", 400);
  }

  const base = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("CTRADER_CLIENT_ID");
  const clientSecret = Deno.env.get("CTRADER_CLIENT_SECRET");
  const redirectUri = Deno.env.get("CTRADER_REDIRECT_URI");
  const encryptionKey = Deno.env.get("CTRADER_TOKEN_ENCRYPTION_KEY");

  if (!base || !service || !clientId || !clientSecret || !redirectUri || !encryptionKey) {
    return page("Connection setup incomplete", "The cTrader integration is awaiting administrator configuration.", 503);
  }

  const apiHeaders = {
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json"
  };

  // Consume the one-time state before handling either success or provider denial.
  const stateHash = await sha256(state);
  const consumed = await fetch(
    `${base}/rest/v1/ctrader_oauth_states?state_hash=eq.${stateHash}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=user_id,redirect_path`,
    {
      method: "PATCH",
      headers: { ...apiHeaders, Prefer: "return=representation" },
      body: JSON.stringify({ consumed_at: new Date().toISOString() })
    }
  );

  if (!consumed.ok) return page("Authorisation could not be verified", "The security check failed. Start a new connection from SuperTech AI.", 400);
  const states = await consumed.json().catch(() => []);
  if (!Array.isArray(states) || states.length !== 1) {
    return page("Authorisation expired", "This request was already used or expired. Start again from SuperTech AI.", 400);
  }

  if (oauthError || !code) {
    return page("Authorisation not completed", "cTrader did not grant access. Return to SuperTech AI and try again.", 400);
  }

  try {
    // cTrader requires the short-lived authorisation code to be exchanged immediately.
    const tokenUrl = new URL("https://openapi.ctrader.com/apps/token");
    tokenUrl.search = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret
    }).toString();

    const tokenResponse = await fetch(tokenUrl, { headers: { Accept: "application/json" } });
    if (!tokenResponse.ok) {
      return page("Token exchange failed", "cTrader did not accept the authorisation code. Please reconnect.", 502);
    }

    const token = await tokenResponse.json();
    if (typeof token.accessToken !== "string" || typeof token.refreshToken !== "string" || token.errorCode) {
      return page("Token exchange failed", "cTrader returned an invalid authorisation response. Please reconnect.", 502);
    }

    const [access, refresh] = await Promise.all([
      encrypt(token.accessToken, encryptionKey),
      encrypt(token.refreshToken, encryptionKey)
    ]);

    const expiresIn = Number(token.expiresIn);
    const safeExpiresIn = Number.isFinite(expiresIn) && expiresIn > 0 ? Math.min(expiresIn, 31536000) : 2628000;
    const save = await fetch(`${base}/rest/v1/ctrader_oauth_grants`, {
      method: "POST",
      headers: { ...apiHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        user_id: states[0].user_id,
        encrypted_access_token: access,
        encrypted_refresh_token: refresh,
        token_expires_at: new Date(Date.now() + safeExpiresIn * 1000).toISOString(),
        granted_scopes: ["trading"],
        status: "account_discovery_pending"
      })
    });

    if (!save.ok) {
      return page("Secure storage failed", "Authorisation succeeded, but the encrypted credentials could not be saved. Contact support before reconnecting.", 500);
    }

    return page("cTrader authorised", "Your cTrader access was received and encrypted. Return to SuperTech AI and continue with account discovery. Automated trading remains off until you configure and enable it.");
  } catch {
    return page("Connection could not be completed", "A secure connection step failed. No trading has been enabled. Please start the connection again or contact support.", 500);
  }
});
