const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS", "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });
const b64decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const decrypt = async (value: string, keyText: string) => {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("invalid_ciphertext_format");
  const raw = b64decode(keyText);
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64decode(ivText) }, key, b64decode(cipherText));
  return new TextDecoder().decode(plain);
};
const waitForPayload = (ws: WebSocket, expected: number, timeoutMs = 8000) => new Promise<Record<string, any>>((resolve, reject) => {
  const timer = setTimeout(() => { cleanup(); reject(new Error("ctrader_response_timeout")); }, timeoutMs);
  const onMessage = (event: MessageEvent) => {
    let message: Record<string, any>;
    try {
      if (typeof event.data !== "string") throw new Error("unexpected_non_text_message");
      message = JSON.parse(event.data);
    } catch {
      cleanup();
      reject(new Error("invalid_ctrader_json_response"));
      return;
    }
    if (message.payloadType === 50) {
      cleanup();
      reject(new Error(String(message.payload?.errorCode || "ctrader_api_error")));
      return;
    }
    if (message.payloadType === expected) {
      cleanup();
      resolve(message.payload || {});
    }
  };
  const onClose = () => { cleanup(); reject(new Error("ctrader_connection_closed")); };
  const cleanup = () => { clearTimeout(timer); ws.removeEventListener("message", onMessage); ws.removeEventListener("close", onClose); };
  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", onClose);
});
const sendRequest = async (ws: WebSocket, payloadType: number, payload: Record<string, unknown>, expected: number) => {
  const response = waitForPayload(ws, expected);
  ws.send(JSON.stringify({ clientMsgId: crypto.randomUUID(), payloadType, payload }));
  return await response;
};
const withCtrader = async <T>(environment: "demo" | "live", run: (ws: WebSocket) => Promise<T>) => {
  const host = environment === "live" ? "wss://live.ctraderapi.com:5036" : "wss://demo.ctraderapi.com:5036";
  const ws = new WebSocket(host);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("ctrader_connect_timeout")), 8000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("ctrader_socket_error")); }, { once: true });
  });
  try { return await run(ws); }
  finally { try { ws.close(); } catch { /* already closed */ } }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const base = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const clientId = Deno.env.get("CTRADER_CLIENT_ID");
  const clientSecret = Deno.env.get("CTRADER_CLIENT_SECRET");
  const encryptionKey = Deno.env.get("CTRADER_TOKEN_ENCRYPTION_KEY");
  if (!clientId || !clientSecret || !encryptionKey) return json({ error: "ctrader_not_configured" }, 503);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
  const identity = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
  if (!identity.ok) return json({ error: "invalid_session" }, 401);
  const user = await identity.json();
  if (!user?.id) return json({ error: "invalid_session" }, 401);

  const headers = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
  const grantResponse = await fetch(`${base}/rest/v1/ctrader_oauth_grants?user_id=eq.${user.id}&status=eq.account_discovery_pending&select=id,encrypted_access_token,encrypted_refresh_token,token_expires_at&order=created_at.desc&limit=1`, { headers });
  if (!grantResponse.ok) return json({ error: "grant_lookup_failed" }, 500);
  const grants = await grantResponse.json();
  if (!Array.isArray(grants) || grants.length !== 1) return json({ error: "no_pending_ctrader_authorisation" }, 404);
  const grant = grants[0];
  let accessToken: string;
  try { accessToken = await decrypt(grant.encrypted_access_token, encryptionKey); }
  catch { return json({ error: "token_decryption_failed" }, 500); }

  const discovered: Array<Record<string, unknown>> = [];
  const failures: Array<{ environment: string; code: string }> = [];
  for (const environment of ["demo", "live"] as const) {
    try {
      const accounts = await withCtrader(environment, async (ws) => {
        await sendRequest(ws, 2100, { clientId, clientSecret }, 2101);
        const list = await sendRequest(ws, 2149, { accessToken }, 2150);
        const rawAccounts = Array.isArray(list.ctidTraderAccount) ? list.ctidTraderAccount : [];
        const matching = rawAccounts.filter((a: Record<string, unknown>) => Boolean(a.isLive) === (environment === "live"));
        const authorised: Array<Record<string, unknown>> = [];
        for (const account of matching) {
          const accountId = String(account.ctidTraderAccountId || "");
          if (!/^\d+$/.test(accountId)) continue;
          await sendRequest(ws, 2102, { ctidTraderAccountId: Number(accountId), accessToken }, 2103);
          authorised.push({
            ctidTraderAccountId: accountId,
            environment,
            traderLogin: account.traderLogin ? String(account.traderLogin) : null,
            brokerTitleShort: typeof account.brokerTitleShort === "string" ? account.brokerTitleShort : "cTrader",
          });
        }
        return authorised;
      });
      discovered.push(...accounts);
    } catch (error) {
      failures.push({ environment, code: error instanceof Error ? error.message.slice(0, 100) : "unknown_error" });
    }
  }

  if (discovered.length === 0) {
    return json({ connected: false, discovered: 0, environmentsChecked: 2, failures, error: "no_accounts_discovered_or_authorised" }, 422);
  }

  const saved: Array<Record<string, unknown>> = [];
  const alreadyLinked: string[] = [];
  for (const account of discovered) {
    const insert = await fetch(`${base}/rest/v1/ctrader_connections`, {
      method: "POST", headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: user.id,
        ctrader_account_id: account.ctidTraderAccountId,
        environment: account.environment,
        broker_name: account.brokerTitleShort,
        account_label: account.traderLogin ? `Login ${account.traderLogin}` : null,
        connection_status: "connected",
        token_expires_at: grant.token_expires_at,
        granted_scopes: ["trading"],
        last_connected_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString()
      })
    });
    if (insert.status === 409) { alreadyLinked.push(String(account.ctidTraderAccountId)); continue; }
    if (!insert.ok) continue;
    const rows = await insert.json();
    const connection = rows?.[0];
    if (!connection?.id) continue;
    await fetch(`${base}/rest/v1/ctrader_execution_settings`, {
      method: "POST", headers: { ...headers, Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ connection_id: connection.id, user_id: user.id, automation_enabled: false, unattended_execution_enabled: false, allow_live_execution: false })
    });
    await fetch(`${base}/rest/v1/ctrader_execution_events`, {
      method: "POST", headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ connection_id: connection.id, user_id: user.id, event_type: "account_discovered_and_authorised", details: { environment: account.environment, broker: account.brokerTitleShort } })
    });
    saved.push({ id: connection.id, accountLabel: connection.account_label, broker: connection.broker_name, environment: connection.environment, status: connection.connection_status });
  }

  await fetch(`${base}/rest/v1/ctrader_oauth_grants?id=eq.${grant.id}`, {
    method: "PATCH", headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ status: "active", updated_at: new Date().toISOString() })
  });
  return json({ connected: true, discovered: discovered.length, saved, alreadyLinkedCount: alreadyLinked.length, failures, automationEnabled: false, liveTradingEnabled: false });
});
