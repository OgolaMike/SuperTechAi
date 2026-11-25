const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const corsHeaders = (origin: string | null) => {
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
  new Response(JSON.stringify(body), { status, headers: corsHeaders(origin) });
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
type DerivMessage = { msg_type?: string; req_id?: number; error?: { code?: string; message?: string }; proposal?: Record<string, unknown> };
const requestProposal = (url: string, payload: Record<string, unknown>): Promise<DerivMessage> =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let settled = false;
    const finish = (error?: Error, value?: DerivMessage) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* already closed */ }
      if (error) reject(error); else resolve(value!);
    };
    const timer = setTimeout(() => finish(new Error("deriv_websocket_timeout")), 12_000);
    socket.onopen = () => socket.send(JSON.stringify(payload));
    socket.onmessage = event => {
      try {
        const message = JSON.parse(String(event.data)) as DerivMessage;
        if (message.req_id !== 47001) return;
        if (message.error) finish(new Error(message.error.code || "deriv_proposal_rejected"));
        else if (message.msg_type === "proposal" && message.proposal) finish(undefined, message);
      } catch { finish(new Error("invalid_deriv_response")); }
    };
    socket.onerror = () => finish(new Error("deriv_websocket_error"));
    socket.onclose = () => { if (!settled) finish(new Error("deriv_websocket_closed")); };
  });

Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  const allowed = (Deno.env.get("APP_URL") || "").replace(/\/$/, "");
  if (req.method === "OPTIONS") {
    if (origin && origin !== allowed) return reply({ error: "origin_not_allowed" }, 403, null);
    return new Response("ok", { headers: corsHeaders(origin) });
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
    const input = await req.json();
    const accountId = typeof input.accountId === "string" ? input.accountId : "";
    const symbol = typeof input.symbol === "string" ? input.symbol : "";
    const contractType = input.contractType;
    const barrier = typeof input.barrier === "string" ? input.barrier : "";
    const stake = Number(input.stake);
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(accountId) || !/^\w{1,30}$/.test(symbol)) return reply({ error: "invalid_market_or_account" }, 400, origin);
    if (contractType !== "ONETOUCH" && contractType !== "NOTOUCH") return reply({ error: "invalid_contract_type" }, 400, origin);
    if (!/^[+-](?:\d{1,15})(?:\.\d{1,12})?$/.test(barrier) || Number(barrier) === 0) return reply({ error: "invalid_relative_barrier" }, 400, origin);
    if (!Number.isFinite(stake) || stake < 0.35 || stake > maxStake) return reply({ error: "stake_outside_server_limit" }, 400, origin);

    const grantsResponse = await fetch(`${base}/rest/v1/deriv_oauth_grants?user_id=eq.${encodeURIComponent(user.id)}&connection_status=eq.connected&select=encrypted_access_token,token_expires_at&limit=1`, {
      headers: { apikey: service, Authorization: `Bearer ${service}` }
    });
    if (!grantsResponse.ok) return reply({ error: "connection_lookup_failed" }, 500, origin);
    const grants = await grantsResponse.json();
    const grant = grants[0];
    if (!grant) return reply({ error: "deriv_not_connected" }, 409, origin);
    if (Date.parse(grant.token_expires_at) <= Date.now()) return reply({ error: "deriv_reconnect_required" }, 401, origin);

    const token = await decrypt(grant.encrypted_access_token, encryptionKey);
    const accountsResponse = await fetch("https://api.derivws.com/trading/v1/options/accounts", { headers: { Authorization: `Bearer ${token}` } });
    if (accountsResponse.status === 401) return reply({ error: "deriv_reconnect_required" }, 401, origin);
    if (!accountsResponse.ok) return reply({ error: "deriv_account_check_failed" }, 502, origin);
    const accountsPayload = await accountsResponse.json();
    const accounts = Array.isArray(accountsPayload.data) ? accountsPayload.data : accountsPayload.data ? [accountsPayload.data] : [];
    const account = accounts.find((item: Record<string, unknown>) => item.account_id === accountId);
    if (!account || account.status !== "active" || !["demo", "real"].includes(String(account.account_type))) {
      return reply({ error: "account_not_authorised_or_active" }, 403, origin);
    }
    // This endpoint only creates a quote. Real-money buying is deliberately not exposed here.
    const otpResponse = await fetch(`https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }
    });
    const otpPayload = await otpResponse.json();
    const wsUrl = otpPayload?.data?.url;
    if (!otpResponse.ok || typeof wsUrl !== "string") return reply({ error: "deriv_session_setup_failed" }, 502, origin);
    const parsedUrl = new URL(wsUrl);
    if (parsedUrl.protocol !== "wss:" || parsedUrl.hostname !== "api.derivws.com" ||
      !parsedUrl.pathname.endsWith(`/ws/${account.account_type}`)) {
      return reply({ error: "invalid_deriv_session_url" }, 502, origin);
    }

    const result = await requestProposal(wsUrl, {
      proposal: 1,
      amount: stake,
      basis: "stake",
      contract_type: contractType,
      currency: String(account.currency),
      duration: 30,
      duration_unit: "m",
      underlying_symbol: symbol,
      barrier,
      req_id: 47001
    });
    const proposal = result.proposal!;
    const proposalId = typeof proposal.id === "string" ? proposal.id : "";
    const askPrice = Number(proposal.ask_price);
    const payout = Number(proposal.payout);
    const spot = Number(proposal.spot);
    if (!proposalId || ![askPrice, payout, spot].every(Number.isFinite) || askPrice <= 0 || payout <= 0 || spot <= 0) {
      return reply({ error: "invalid_deriv_proposal" }, 502, origin);
    }
    return reply({
      proposal: {
        id: proposalId,
        symbol,
        contractType,
        accountType: account.account_type,
        currency: account.currency,
        stake,
        askPrice,
        payout,
        spot,
        barrier,
        durationMinutes: 30,
        expiresAt: Number(proposal.date_expiry) || null
      },
      executionEnabled: false,
      message: "Quote only. No contract has been purchased."
    }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : "options_proposal_failed";
    const safe = ["deriv_websocket_timeout", "deriv_websocket_error", "deriv_websocket_closed", "invalid_deriv_response", "invalid_ciphertext", "invalid_encryption_key"].includes(message) ? message : "options_proposal_failed";
    return reply({ error: safe }, 502, origin);
  }
});
