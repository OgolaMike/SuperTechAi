const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const headersFor = (origin: string | null) => {
  const allowed = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
  const headers: Record<string, string> = { ...jsonHeaders, "Vary": "Origin" };
  if (origin && allowed && origin === allowed) {
    headers["Access-Control-Allow-Origin"] = allowed;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
  }
  return headers;
};
const reply = (body: unknown, status = 200, origin: string | null = null) =>
  new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const decrypt = async (value: string, keyText: string) => {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("invalid_ciphertext");
  const raw = decode(keyText);
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(ivText) }, key, decode(cipherText));
  return new TextDecoder().decode(plain);
};

Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  const allowed = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
  if (req.method === "OPTIONS") {
    if (origin && origin !== allowed) return reply({ error: "origin_not_allowed" }, 403, null);
    return new Response("ok", { headers: headersFor(origin) });
  }
  if (req.method !== "POST") return reply({ error: "method_not_allowed" }, 405, origin);
  if (!allowed || (origin && origin !== allowed)) return reply({ error: "origin_not_allowed" }, 403, null);

  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const encryptionKey = Deno.env.get("DERIV_TOKEN_ENCRYPTION_KEY");
  const maxStake = Number(Deno.env.get("OPTIONS_MAX_STAKE") || "");
  if (!base || !anon || !service || !encryptionKey || !Number.isFinite(maxStake) || maxStake <= 0) {
    return reply({ error: "options_backend_not_configured" }, 503, origin);
  }
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply({ error: "authentication_required" }, 401, origin);

  try {
    const identity = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
    if (!identity.ok) return reply({ error: "invalid_session" }, 401, origin);
    const user = await identity.json();
    const input = await req.json().catch(() => ({}));
    const action = input.action === "get" ? "get" : input.action === "save" ? "save" : "";
    if (!action) return reply({ error: "invalid_action" }, 400, origin);

    const settingsUrl = `${base}/rest/v1/options_trader_settings?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,account_id,account_mode,contract_kind,stake,automation_enabled,real_trading_consent_at,updated_at&limit=1`;
    if (action === "get") {
      const response = await fetch(settingsUrl, { headers: { apikey: service, Authorization: `Bearer ${service}` } });
      if (!response.ok) return reply({ error: "settings_lookup_failed" }, 500, origin);
      const rows = await response.json();
      return reply({ settings: rows[0] ?? null, executionEnabled: false });
    }

    const accountId = typeof input.accountId === "string" ? input.accountId : "";
    const accountMode = input.accountMode;
    const contractKind = input.contractKind;
    const stake = Number(input.stake);
    const requestedAutomation = input.automationEnabled === true;
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(accountId)) return reply({ error: "invalid_account" }, 400, origin);
    if (accountMode !== "demo" && accountMode !== "real") return reply({ error: "invalid_account_mode" }, 400, origin);
    if (!["ONETOUCH", "NOTOUCH", "BOTH"].includes(contractKind)) return reply({ error: "invalid_contract_kind" }, 400, origin);
    if (!Number.isFinite(stake) || stake < 0.35 || stake > maxStake) return reply({ error: "stake_outside_server_limit" }, 400, origin);

    const grantsResponse = await fetch(`${base}/rest/v1/deriv_oauth_grants?user_id=eq.${encodeURIComponent(user.id)}&connection_status=eq.connected&select=encrypted_access_token,token_expires_at&limit=1`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` }
    });
    if (!grantsResponse.ok) return reply({ error: "connection_lookup_failed" }, 500, origin);
    const grants = await grantsResponse.json();
    const grant = grants[0];
    if (!grant || Date.parse(grant.token_expires_at) <= Date.now()) return reply({ error: "deriv_reconnect_required" }, 401, origin);

    const token = await decrypt(grant.encrypted_access_token, encryptionKey);
    const accountsResponse = await fetch("https://api.derivws.com/trading/v1/options/accounts", { headers: { Authorization: `Bearer ${token}` } });
    if (!accountsResponse.ok) return reply({ error: accountsResponse.status === 401 ? "deriv_reconnect_required" : "deriv_account_check_failed" }, 502, origin);
    const accountsPayload = await accountsResponse.json();
    const accounts = Array.isArray(accountsPayload.data) ? accountsPayload.data : accountsPayload.data ? [accountsPayload.data] : [];
    const account = accounts.find((item: Record<string, unknown>) => item.account_id === accountId);
    if (!account || account.status !== "active" || account.account_type !== accountMode) return reply({ error: "account_not_authorised_or_active" }, 403, origin);

    // Automation stays off until Demo end-to-end execution and settlement tests are released.
    if (requestedAutomation) return reply({ error: "execution_not_enabled", automationEnabled: false }, 409, origin);
    const consentAt = accountMode === "real" && input.confirmRealTrading === true ? new Date().toISOString() : null;
    const payload = {
      user_id: user.id,
      account_id: accountId,
      account_mode: accountMode,
      contract_kind: contractKind,
      stake,
      automation_enabled: false,
      real_trading_consent_at: consentAt,
      updated_at: new Date().toISOString()
    };
    const saved = await fetch(`${base}/rest/v1/options_trader_settings?on_conflict=user_id`, {
      method: "POST",
      headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload)
    });
    if (!saved.ok) return reply({ error: "settings_save_failed" }, 500, origin);
    const rows = await saved.json();
    return reply({ settings: rows[0] ?? { ...payload }, executionEnabled: false, message: "Settings saved. Automated purchases remain disabled." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "options_settings_failed";
    const safe = ["invalid_ciphertext", "invalid_encryption_key"].includes(message) ? message : "options_settings_failed";
    return reply({ error: safe }, 502, origin);
  }
});
