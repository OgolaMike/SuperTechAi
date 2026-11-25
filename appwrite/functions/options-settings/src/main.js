const json = (res, body, status = 200) => res.json(body, status);
const safeText = value => typeof value === "string" ? value : "";

const decrypt = async (value, keyText) => {
  const [version, ivText, cipherText] = safeText(value).split(".");
  if (version !== "v1" || !ivText || !cipherText) throw new Error("invalid_ciphertext");
  const decode = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
  const raw = decode(keyText);
  if (raw.length !== 32) throw new Error("invalid_encryption_key");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(ivText) }, key, decode(cipherText));
  return new TextDecoder().decode(plain);
};

export default async ({ req, res, error }) => {
  const userId = safeText(req.headers["x-appwrite-user-id"]);
  const userJwt = safeText(req.headers["x-appwrite-user-jwt"]);
  const apiKey = safeText(req.headers["x-appwrite-key"]) || safeText(process.env.APPWRITE_FUNCTION_API_KEY);
  const endpoint = safeText(process.env.APPWRITE_FUNCTION_API_ENDPOINT).replace(/\/$/, "");
  const projectId = safeText(process.env.APPWRITE_FUNCTION_PROJECT_ID);
  const databaseId = safeText(process.env.APPWRITE_DATABASE_ID);
  const grantsTable = safeText(process.env.DERIV_OAUTH_GRANTS_TABLE_ID);
  const settingsTable = safeText(process.env.OPTIONS_SETTINGS_TABLE_ID);
  const encryptionKey = safeText(process.env.DERIV_TOKEN_ENCRYPTION_KEY);
  const maxStake = Number(process.env.OPTIONS_MAX_STAKE);

  if (!userId || !userJwt) return json(res, { error: "authentication_required" }, 401);
  if (!apiKey || !endpoint || !projectId || !databaseId || !grantsTable || !settingsTable ||
      !encryptionKey || !Number.isFinite(maxStake) || maxStake <= 0) {
    return json(res, { error: "options_backend_not_configured" }, 503);
  }

  const headers = {
    "X-Appwrite-Project": projectId,
    "X-Appwrite-Key": apiKey,
    "Content-Type": "application/json",
  };
  const rowUrl = (tableId, rowId) =>
    `${endpoint}/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/rows/${encodeURIComponent(rowId)}`;
  const getRow = async (tableId, rowId) => {
    const response = await fetch(rowUrl(tableId, rowId), { headers });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("appwrite_row_lookup_failed");
    return response.json();
  };
  const saveRow = async (tableId, rowId, data) => {
    const current = await getRow(tableId, rowId);
    const response = await fetch(current ? rowUrl(tableId, rowId) : `${endpoint}/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/rows`, {
      method: current ? "PATCH" : "POST",
      headers,
      body: JSON.stringify(current ? { data } : { rowId, data }),
    });
    if (!response.ok) throw new Error("appwrite_row_save_failed");
    return response.json();
  };

  try {
    const body = req.bodyJson ?? {};
    if (body.action === "get") {
      const row = await getRow(settingsTable, userId);
      return json(res, { settings: row?.data ?? null, executionEnabled: false });
    }
    if (body.action !== "save") return json(res, { error: "invalid_action" }, 400);

    const accountId = safeText(body.accountId);
    const accountMode = body.accountMode;
    const contractKind = body.contractKind;
    const stake = Number(body.stake);
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(accountId)) return json(res, { error: "invalid_account" }, 400);
    if (accountMode !== "demo" && accountMode !== "real") return json(res, { error: "invalid_account_mode" }, 400);
    if (!["ONETOUCH", "NOTOUCH", "BOTH"].includes(contractKind)) return json(res, { error: "invalid_contract_kind" }, 400);
    if (!Number.isFinite(stake) || stake < 0.35 || stake > maxStake) return json(res, { error: "stake_outside_server_limit" }, 400);

    const grantRow = await getRow(grantsTable, userId);
    const grant = grantRow?.data;
    if (!grant || grant.connection_status !== "connected" || Date.parse(grant.token_expires_at) <= Date.now()) {
      return json(res, { error: "deriv_reconnect_required" }, 401);
    }
    const token = await decrypt(grant.encrypted_access_token, encryptionKey);
    const accountsResponse = await fetch("https://api.derivws.com/trading/v1/options/accounts", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!accountsResponse.ok) return json(res, { error: accountsResponse.status === 401 ? "deriv_reconnect_required" : "deriv_account_check_failed" }, 502);
    const payload = await accountsResponse.json();
    const accounts = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    const account = accounts.find(item => item.account_id === accountId);
    if (!account || account.status !== "active" || account.account_type !== accountMode) {
      return json(res, { error: "account_not_authorised_or_active" }, 403);
    }

    // Activation is deliberately locked until Demo purchase and settlement tests pass.
    if (body.automationEnabled === true) return json(res, { error: "execution_not_enabled", automationEnabled: false }, 409);
    const data = {
      user_id: userId,
      account_id: accountId,
      account_mode: accountMode,
      contract_kind: contractKind,
      stake,
      automation_enabled: false,
      real_trading_consent_at: null,
      updated_at: new Date().toISOString(),
    };
    const saved = await saveRow(settingsTable, userId, data);
    return json(res, { settings: saved.data ?? data, executionEnabled: false, message: "Settings saved. Automated purchases remain disabled." });
  } catch (cause) {
    error(cause instanceof Error ? cause.message : "options_settings_failed");
    const message = cause instanceof Error ? cause.message : "";
    return json(res, { error: ["invalid_ciphertext", "invalid_encryption_key"].includes(message) ? message : "options_settings_failed" }, 502);
  }
};
