import { calculateCTraderRiskSize } from "../_shared/ctrader-risk-sizing.ts";
import { validateCTraderExecutionPreflight } from "../_shared/ctrader-execution-preflight.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const b64decode = (value: string) => Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
const b64encode = (value: Uint8Array) => btoa(String.fromCharCode(...value));
const decrypt = async (value: string, keyText: string) => {
  const [version, ivText, cipherText] = value.split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("invalid_ciphertext_format");
  const raw = b64decode(keyText);
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64decode(ivText) }, key, b64decode(cipherText));
  return new TextDecoder().decode(plain);
};
const encrypt = async (plain: string, keyText: string) => {
  const raw = b64decode(keyText);
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return `v1.${b64encode(iv)}.${b64encode(new Uint8Array(cipher))}`;
};
const safeError = (value: unknown) =>
  (value instanceof Error ? value.message : "ctrader_cloud_reconcile_failed")
    .replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 100);

type Message = { payloadType?: number; payload?: Record<string, unknown>; clientMsgId?: string };
const sendRequest = (ws: WebSocket, payloadType: number, payload: Record<string, unknown>, expected: number) =>
  new Promise<Record<string, unknown>>((resolve, reject) => {
    const clientMsgId = crypto.randomUUID();
    const timer = setTimeout(() => cleanup(new Error("ctrader_response_timeout")), 10000);
    const onMessage = (event: MessageEvent) => {
      let message: Message;
      try {
        if (typeof event.data !== "string") throw new Error("unexpected_non_text_message");
        message = JSON.parse(event.data);
      } catch {
        cleanup(new Error("invalid_ctrader_json_response"));
        return;
      }
      if (message.clientMsgId && message.clientMsgId !== clientMsgId) return;
      if (message.payloadType === 2142 || message.payloadType === 50) {
        const p = message.payload ?? {};
        cleanup(new Error(String(p.errorCode ?? "ctrader_api_error")));
        return;
      }
      if (message.payloadType === expected) cleanup(undefined, message.payload ?? {});
    };
    const onClose = () => cleanup(new Error("ctrader_connection_closed"));
    const cleanup = (error?: Error, result?: Record<string, unknown>) => {
      clearTimeout(timer);
      ws.removeEventListener("message", onMessage);
      ws.removeEventListener("close", onClose);
      if (error) reject(error);
      else resolve(result ?? {});
    };
    ws.addEventListener("message", onMessage);
    ws.addEventListener("close", onClose);
    ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
  });

const sendRequestForSpot = (
  ws: WebSocket,
  payloadType: number,
  payload: Record<string, unknown>,
  expectedResponse: number,
  expectedSymbolId: number,
) => new Promise<{ bid: number; ask: number; timestamp: number | null }>((resolve, reject) => {
  const clientMsgId = crypto.randomUUID();
  let responseSeen = false;
  let quote: { bid: number; ask: number; timestamp: number | null } | undefined;
  const timer = setTimeout(() => cleanup(new Error("ctrader_spot_quote_timeout")), 10000);
  const onMessage = (event: MessageEvent) => {
    let message: Message;
    try {
      if (typeof event.data !== "string") throw new Error("unexpected_non_text_message");
      message = JSON.parse(event.data);
    } catch {
      cleanup(new Error("invalid_ctrader_json_response"));
      return;
    }
    const p = message.payload ?? {};
    if (message.payloadType === 2142 || message.payloadType === 50) {
      cleanup(new Error(String(p.errorCode ?? "ctrader_api_error")));
      return;
    }
    if (message.payloadType === expectedResponse && message.clientMsgId === clientMsgId) {
      responseSeen = true;
      if (quote) cleanup(undefined, quote);
      return;
    }
    if (message.payloadType === 2131 && Number(p.symbolId) === expectedSymbolId) {
      const bidRaw = Number(p.bid);
      const askRaw = Number(p.ask);
      if (Number.isFinite(bidRaw) && bidRaw > 0 && Number.isFinite(askRaw) && askRaw >= bidRaw) {
        quote = {
          bid: bidRaw / 100000,
          ask: askRaw / 100000,
          timestamp: Number.isFinite(Number(p.timestamp)) ? Number(p.timestamp) : null,
        };
        if (responseSeen) cleanup(undefined, quote);
      }
    }
  };
  const onClose = () => cleanup(new Error("ctrader_connection_closed"));
  const cleanup = (error?: Error, result?: { bid: number; ask: number; timestamp: number | null }) => {
    clearTimeout(timer);
    ws.removeEventListener("message", onMessage);
    ws.removeEventListener("close", onClose);
    if (error) reject(error);
    else if (result) resolve(result);
    else reject(new Error("ctrader_spot_quote_missing"));
  };
  ws.addEventListener("message", onMessage);
  ws.addEventListener("close", onClose);
  ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
});

const rest = async (base: string, service: string, path: string, init: RequestInit = {}) => {
  const headers = new Headers({
    apikey: service,
    Authorization: `Bearer ${service}`,
    "Content-Type": "application/json",
  });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
  if (!response.ok) throw new Error(`database_${response.status}`);
  if (response.status === 204) return null;
  return await response.json();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const base = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("CTRADER_CLIENT_ID");
  const clientSecret = Deno.env.get("CTRADER_CLIENT_SECRET");
  const encryptionKey = Deno.env.get("CTRADER_TOKEN_ENCRYPTION_KEY");
  if (!base || !anon || !service || !clientId || !clientSecret || !encryptionKey) {
    return json({ error: "ctrader_not_configured" }, 503);
  }
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "authentication_required" }, 401);
  const identity = await fetch(`${base}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization } });
  if (!identity.ok) return json({ error: "invalid_session" }, 401);
  const user = await identity.json();
  if (!user?.id) return json({ error: "invalid_session" }, 401);

  const body = await req.json().catch(() => ({}));
  const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";
  if (!/^[0-9a-f-]{36}$/i.test(connectionId)) return json({ error: "valid_connection_id_required" }, 400);

  try {
    const connections = await rest(base, service,
      `ctrader_connections?id=eq.${connectionId}&user_id=eq.${user.id}&select=id,user_id,ctrader_account_id,environment,connection_status&limit=1`);
    const connection = Array.isArray(connections) ? connections[0] : null;
    if (!connection) return json({ error: "connection_not_found" }, 404);
    if (connection.connection_status === "disconnected") return json({ error: "connection_disconnected" }, 409);

    const grants = await rest(base, service,
      `ctrader_oauth_grants?user_id=eq.${user.id}&status=eq.active&select=id,encrypted_access_token,encrypted_refresh_token,token_expires_at,granted_scopes,updated_at&order=created_at.desc&limit=1`);
    const grant = Array.isArray(grants) ? grants[0] : null;
    if (!grant) return json({ error: "ctrader_authorisation_required" }, 409);
    if (!Array.isArray(grant.granted_scopes) || !grant.granted_scopes.includes("trading")) {
      return json({ error: "trading_permission_required" }, 403);
    }

    let accessToken = await decrypt(grant.encrypted_access_token, encryptionKey);
    let refreshToken = await decrypt(grant.encrypted_refresh_token, encryptionKey);
    let expiresAt = new Date(grant.token_expires_at).getTime();
    let refreshed = false;
    if (!Number.isFinite(expiresAt) || expiresAt < Date.now() + 120_000) {
      const tokenUrl = new URL("https://openapi.ctrader.com/apps/token");
      tokenUrl.search = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString();
      const tokenResponse = await fetch(tokenUrl, { method: "POST", headers: { Accept: "application/json" } });
      if (!tokenResponse.ok) throw new Error("ctrader_token_refresh_failed");
      const token = await tokenResponse.json();
      if (typeof token.accessToken !== "string" || typeof token.refreshToken !== "string" || !Number.isFinite(Number(token.expiresIn))) {
        throw new Error("ctrader_token_refresh_invalid_response");
      }
      accessToken = token.accessToken;
      refreshToken = token.refreshToken;
      expiresAt = Date.now() + Math.min(Number(token.expiresIn), 31536000) * 1000;
      const [encryptedAccess, encryptedRefresh] = await Promise.all([
        encrypt(accessToken, encryptionKey), encrypt(refreshToken, encryptionKey),
      ]);
      const updated = await rest(base, service,
        `ctrader_oauth_grants?id=eq.${grant.id}&updated_at=eq.${encodeURIComponent(grant.updated_at)}&select=id`,
        { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({
          encrypted_access_token: encryptedAccess,
          encrypted_refresh_token: encryptedRefresh,
          token_expires_at: new Date(expiresAt).toISOString(),
          updated_at: new Date().toISOString(),
        }) });
      if (!Array.isArray(updated) || updated.length !== 1) throw new Error("ctrader_token_rotation_conflict_reconnect_required");
      await rest(base, service, `ctrader_connections?user_id=eq.${user.id}`, {
        method: "PATCH", body: JSON.stringify({ token_expires_at: new Date(expiresAt).toISOString(), updated_at: new Date().toISOString() }),
      });
      refreshed = true;
    }

    const host = connection.environment === "live"
      ? "wss://live.ctraderapi.com:5036"
      : "wss://demo.ctraderapi.com:5036";
    const ws = new WebSocket(host);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("ctrader_connect_timeout")), 8000);
      ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("ctrader_socket_error")); }, { once: true });
    });
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      heartbeat = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ payloadType: 51, payload: {} }));
      }, 10000);
      await sendRequest(ws, 2100, { clientId, clientSecret }, 2101);
      await sendRequest(ws, 2102, {
        ctidTraderAccountId: Number(connection.ctrader_account_id),
        accessToken,
      }, 2103);
      const trader = await sendRequest(ws, 2121, {
        ctidTraderAccountId: Number(connection.ctrader_account_id),
      }, 2122);
      const symbolsResponse = await sendRequest(ws, 2114, {
        ctidTraderAccountId: Number(connection.ctrader_account_id),
      }, 2115);
      const lightSymbols = (Array.isArray(symbolsResponse.symbol) ? symbolsResponse.symbol : []) as Record<string, unknown>[];
      const symbolMap = new Map<string, string>();
      for (const symbol of lightSymbols) {
        if (symbol.symbolId !== undefined && typeof symbol.symbolName === "string") {
          symbolMap.set(String(symbol.symbolId), symbol.symbolName);
        }
      }
      const availableSymbols = lightSymbols
        .filter((symbol) => symbol.symbolId !== undefined && typeof symbol.symbolName === "string")
        .map((symbol) => ({
          symbolId: Number(symbol.symbolId),
          symbolName: String(symbol.symbolName),
          enabled: symbol.enabled !== false,
        }))
        .filter((symbol) => Number.isSafeInteger(symbol.symbolId) && symbol.symbolId > 0)
        .sort((left, right) => left.symbolName.localeCompare(right.symbolName));
      let preflightPreview: Record<string, unknown> | null = null;
      if (body?.preflightPreview !== undefined) {
        const request = body.preflightPreview;
        const symbolId = Number(request?.symbolId);
        const riskPercent = Number(request?.riskPercent);
        const stopLoss = Number(request?.stopLoss);
        const takeProfit = Number(request?.takeProfit);
        const maxSpreadPips = Number(request?.maxSpreadPips);
        if (!Number.isSafeInteger(symbolId) || symbolId <= 0 ||
            !Number.isFinite(riskPercent) || riskPercent <= 0 || riskPercent > 1 ||
            !Number.isFinite(stopLoss) || stopLoss <= 0 ||
            !Number.isFinite(takeProfit) || takeProfit <= 0 ||
            !Number.isFinite(maxSpreadPips) || maxSpreadPips <= 0 ||
            (request?.direction !== "BUY" && request?.direction !== "SELL")) {
          throw new Error("invalid_ctrader_preflight_preview_request");
        }
        const symbolResponse = await sendRequest(ws, 2116, {
          ctidTraderAccountId: Number(connection.ctrader_account_id),
          symbolId: [symbolId],
        }, 2117);
        const symbolList = Array.isArray(symbolResponse.symbol) ? symbolResponse.symbol as Record<string, unknown>[] : [];
        const symbol = symbolList.find((item) => Number(item.symbolId) === symbolId);
        const lightSymbol = lightSymbols.find((item) => Number(item.symbolId) === symbolId);
        if (!symbol || !lightSymbol) throw new Error("ctrader_symbol_not_found");
        if (lightSymbol.enabled === false) throw new Error("ctrader_symbol_not_enabled");
        const assetResponse = await sendRequest(ws, 2112, {
          ctidTraderAccountId: Number(connection.ctrader_account_id),
        }, 2113);
        const assets = Array.isArray(assetResponse.asset) ? assetResponse.asset as Record<string, unknown>[] : [];
        const assetName = (assetId: unknown) => {
          const asset = assets.find((item) => String(item.assetId) === String(assetId));
          return typeof asset?.name === "string" ? asset.name : "";
        };
        const quoteCurrency = assetName(symbol.quoteAssetId);
        const depositCurrency = assetName(trader.depositAssetId);
        if (!quoteCurrency || !depositCurrency) throw new Error("ctrader_asset_currency_unresolved");
        const quote = await sendRequestForSpot(ws, 2127, {
          ctidTraderAccountId: Number(connection.ctrader_account_id),
          symbolId: [symbolId],
        }, 2128, symbolId);
        const direction = request.direction as "BUY" | "SELL";
        const entryPrice = direction === "BUY" ? quote.ask : quote.bid;
        if (!(Number(symbol.pipPosition) >= 0) || !Number.isInteger(Number(symbol.pipPosition))) {
          throw new Error("ctrader_symbol_pip_position_missing");
        }
        const pipSize = 10 ** -Number(symbol.pipPosition);
        const riskSize = calculateCTraderRiskSize({
          balance: Number(trader.balance),
          moneyDigits: Number(trader.moneyDigits),
          riskPercent,
          entryPrice,
          stopLoss,
          direction,
          quoteCurrency,
          depositCurrency,
          minVolume: Number(symbol.minVolume),
          maxVolume: Number(symbol.maxVolume),
          stepVolume: Number(symbol.stepVolume),
        });
        if (direction === "BUY" && !(stopLoss < entryPrice && takeProfit > entryPrice)) {
          throw new Error("invalid_buy_target_geometry");
        }
        if (direction === "SELL" && !(takeProfit < entryPrice && stopLoss > entryPrice)) {
          throw new Error("invalid_sell_target_geometry");
        }
        const spread = validateCTraderExecutionPreflight({
          accessRights: Number(trader.accessRights),
          tradingMode: Number(symbol.tradingMode),
          direction,
          shortSellingEnabled: symbol.enableShortSelling === true,
          isLimitedRisk: trader.isLimitedRisk === true,
          symbolAllowsGuaranteedStopLoss: symbol.guaranteedStopLoss === true,
          guaranteedStopLossRequested: trader.isLimitedRisk === true,
          bid: quote.bid,
          ask: quote.ask,
          pipSize,
          maxSpreadPips,
          volumeCents: riskSize.volumeCents,
          minVolume: Number(symbol.minVolume),
          maxVolume: Number(symbol.maxVolume),
          stepVolume: Number(symbol.stepVolume),
        });
        const marginResponse = await sendRequest(ws, 2139, {
          ctidTraderAccountId: Number(connection.ctrader_account_id),
          symbolId,
          volume: [riskSize.volumeCents],
        }, 2140);
        const marginRows = Array.isArray(marginResponse.margin) ? marginResponse.margin as Record<string, unknown>[] : [];
        const marginRow = marginRows.find((item) => Number(item.volume) === riskSize.volumeCents);
        if (!marginRow) throw new Error("ctrader_expected_margin_missing");
        const marginDigits = Number(marginResponse.moneyDigits);
        if (!Number.isInteger(marginDigits) || marginDigits < 0 || marginDigits > 8) {
          throw new Error("ctrader_expected_margin_scale_missing");
        }
        const expectedMarginRaw = Number(direction === "BUY" ? marginRow.buyMargin : marginRow.sellMargin);
        if (!Number.isFinite(expectedMarginRaw) || expectedMarginRaw <= 0) {
          throw new Error("ctrader_expected_margin_invalid");
        }
        const expectedMargin = expectedMarginRaw / (10 ** marginDigits);
        const balance = Number(trader.balance) / (10 ** Number(trader.moneyDigits));
        const marginUtilizationPercent = expectedMargin / balance * 100;
        preflightPreview = {
          readOnly: true,
          orderPlaced: false,
          symbolId,
          symbolName: typeof symbol.symbolName === "string" ? symbol.symbolName : String(symbolId),
          direction,
          bid: quote.bid,
          ask: quote.ask,
          quoteTimestamp: quote.timestamp,
          spreadPips: spread.spreadPips,
          entryPrice,
          stopLoss,
          takeProfit,
          quoteCurrency,
          depositCurrency,
          volumeCents: riskSize.volumeCents,
          volumeUnits: riskSize.volumeUnits,
          riskAmount: riskSize.riskAmount,
          estimatedStopLoss: riskSize.estimatedStopLoss,
          expectedMargin,
          marginUtilizationPercent,
          guaranteedStopLoss: spread.guaranteedStopLoss,
          freeMarginVerified: false,
          executionAuthorized: false,
          note: "Preview only. Free margin, contract-specific conversion and durable protected execution are not yet verified.",
        };
      }
      const reconciled = await sendRequest(ws, 2124, {
        ctidTraderAccountId: Number(connection.ctrader_account_id),
        returnProtectionOrders: false,
      }, 2125);
      const positions = Array.isArray(reconciled.position) ? reconciled.position as Record<string, unknown>[] : [];
      const pendingOrders = Array.isArray(reconciled.order) ? reconciled.order as Record<string, unknown>[] : [];
      let savedPositions = 0;
      for (const position of positions) {
        const trade = (position.tradeData ?? {}) as Record<string, unknown>;
        const brokerPositionId = String(position.positionId ?? "");
        const symbolId = String(trade.symbolId ?? "");
        const volume = Number(trade.volume ?? 0) / 100;
        const entryPrice = Number(position.price ?? 0);
        const direction = Number(trade.tradeSide) === 1 ? "BUY" : Number(trade.tradeSide) === 2 ? "SELL" : null;
        if (!brokerPositionId || !symbolId || !direction || !(volume > 0) || !(entryPrice > 0)) continue;
        const existing = await rest(base, service,
          `ctrader_positions?connection_id=eq.${connectionId}&broker_position_id=eq.${brokerPositionId}&select=id&limit=1`);
        const current = Array.isArray(existing) ? existing[0] : null;
        const label = typeof trade.label === "string" ? trade.label : "";
        const snapshot = {
          position_status: Number(position.positionStatus) === 1 ? "open" : "unknown",
          symbol_id: symbolId,
          label: label.slice(0, 100),
          swap: Number(position.swap ?? 0),
          commission: Number(position.commission ?? 0),
          used_margin: Number(position.usedMargin ?? 0),
          guaranteed_stop_loss: position.guaranteedStopLoss === true,
        };
        const record = {
          connection_id: connectionId,
          user_id: user.id,
          broker_position_id: brokerPositionId,
          symbol: symbolMap.get(symbolId) ?? symbolId,
          direction,
          volume,
          entry_price: entryPrice,
          stop_loss: Number(position.stopLoss ?? 0) || null,
          take_profit: Number(position.takeProfit ?? 0) || null,
          position_status: Number(position.positionStatus) === 1 ? "open" : "unknown",
          strategy_owned: label.startsWith("supertech:"),
          opened_at: Number(trade.openTimestamp) > 0 ? new Date(Number(trade.openTimestamp)).toISOString() : null,
          broker_updated_at: Number(position.utcLastUpdateTimestamp) > 0 ? new Date(Number(position.utcLastUpdateTimestamp)).toISOString() : new Date().toISOString(),
          sanitized_snapshot: snapshot,
        };
        if (current?.id) {
          await rest(base, service, `ctrader_positions?id=eq.${current.id}`, {
            method: "PATCH", body: JSON.stringify(record),
          });
        } else {
          await rest(base, service, "ctrader_positions", {
            method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(record),
          });
        }
        savedPositions++;
      }
      await rest(base, service, `ctrader_connections?id=eq.${connectionId}&user_id=eq.${user.id}`, {
        method: "PATCH", body: JSON.stringify({
          connection_status: "connected",
          last_seen_at: new Date().toISOString(),
          last_error_code: null,
          updated_at: new Date().toISOString(),
        }),
      });
      await rest(base, service, "ctrader_execution_events", {
        method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
          connection_id: connectionId,
          user_id: user.id,
          event_type: "account_reconciled",
          details: {
            open_positions_seen: positions.length,
            positions_saved: savedPositions,
            pending_orders_seen: pendingOrders.length,
            token_refreshed: refreshed,
            account_balance_raw: trader.balance === undefined ? null : String(trader.balance),
            account_money_digits: trader.moneyDigits === undefined ? null : Number(trader.moneyDigits),
          },
        }),
      });
      return json({
        connected: true,
        reconciled: true,
        openPositions: positions.length,
        pendingOrders: pendingOrders.length,
        savedPositions,
        tokenRefreshed: refreshed,
        tradingEnabled: false,
        orderPlaced: false,
        symbols: availableSymbols,
        preflightPreview,
      });
    } finally {
      if (heartbeat !== undefined) clearInterval(heartbeat);
      try { ws.close(); } catch { /* already closed */ }
    }
  } catch (error) {
    const code = safeError(error);
    if (code.includes("token_rotation_conflict")) {
      return json({ error: code, reconnectRequired: true }, 409);
    }
    return json({ error: code, tradingEnabled: false, orderPlaced: false }, 502);
  }
});
