# cTrader migration parity audit

Audit date: 2026-11-12  
Repository branch: `automation/unified-mobile-cloud`  
Active Supabase project ref: `jtfsqhewotinvlrcadwq`

## Finding

The active Supabase migration history records these nine cTrader migrations as applied:

| Applied version | Migration |
|---|---|
| 20261105160251 | create_ctrader_automation_foundation |
| 20261105160255 | add_ctrader_oauth_grant_vault |
| 20261105160408 | harden_ctrader_settings_anon |
| 20261105160904 | add_ctrader_runtime_lease_claiming |
| 20261105162840 | harden_ctrader_runtime_leases |
| 20261105163226 | harden_ctrader_member_settings |
| 20261105163658 | ctrader_settings_definer_rpc_trigger_fix |
| 20261105163704 | ctrader_automation_arming_and_intent_claims |
| 20261107061617 | optimize_ctrader_rls_auth_uid_initplans |

The development branch contains only `20261107061620_optimize_ctrader_rls_auth_uid_initplans.sql`. Its version does not match the applied `20261107061617` record, and the eight earlier migration files are absent. The mismatched file contains the auth.uid() policy-expression optimization for six tables; it is not a substitute for the missing foundation and hardening migrations.

A repository code/commit search did not locate authoritative copies of the missing original migration SQL. Therefore the original migrations have **not** been recovered, and must not be recreated by guessing or renamed.

## Live database catalog inventory (read-only inspection)

The active project currently contains these nine cTrader tables:

- `ctrader_connections`
- `ctrader_oauth_grants`
- `ctrader_oauth_states`
- `ctrader_execution_settings`
- `ctrader_runtime_leases`
- `ctrader_execution_intents`
- `ctrader_execution_events`
- `ctrader_positions`
- `ctrader_daily_risk_snapshots`

The six member-facing RLS policies currently visible in `pg_policies` are:

- `members_read_own_ctrader_connection`
- `members_read_own_ctrader_risk`
- `members_read_own_ctrader_events`
- `members_read_own_ctrader_intents`
- `members_manage_own_ctrader_settings`
- `members_read_own_ctrader_positions`

The settings policy scopes both USING and WITH CHECK to the authenticated member. The other member read policies scope records to the member, with risk snapshots scoped through the owning connection.

The live catalog also contains these cTrader routines:

- `arm_ctrader_automation(uuid, boolean)`
- `disarm_ctrader_automation(uuid)`
- `claim_ctrader_runtime_lease(uuid, text, integer)`
- `release_ctrader_runtime_lease(uuid, text)`
- `claim_ctrader_execution_intent(uuid, text, integer)`
- `guard_ctrader_execution_settings()`

The inspected arming routine requires an authenticated owner, a connected account, and explicit confirmation when the account environment is live. It sets the live-execution flag only for a live account with that confirmation. The intent-claim routine requires a valid runtime lease and enabled automation; live intents additionally require live execution to be armed. These are catalog observations, not a complete security review or proof that an order executor is production-ready.

## Why this blocks release

A clean database created from the repository cannot currently reproduce the cTrader schema and security machinery present in the active project. This blocks trustworthy clean-environment testing and any safe rollout of a cTrader order executor.

Do not deploy the cTrader executor or apply duplicate table-creation SQL to the active project as a shortcut.

## Recovery and validation plan

1. Obtain the exact original SQL for all nine applied cTrader migrations from the authoritative original repository history, a trusted backup, or Supabase migration artifacts.
2. Restore exact versioned files to `supabase/migrations`, preserving original order and contents.
3. Compare the branch's `20261107061620` SQL with the applied `20261107061617` SQL; reconcile or remove the mismatch only after proving equivalence.
4. Rebuild a disposable clean Supabase environment from repository migrations.
5. Compare table columns, defaults, indexes, constraints, RLS policies, grants, triggers, function bodies, and security-definer search paths/privileges against the live catalog.
6. Run tests against the disposable environment. Do not use production as the migration test target.
7. Only then resume protected pending-order execution for both live and demo environments, including broker-confirmed SL/TP protection, idempotency, uncertain-submit recovery, and lifecycle reconciliation.

If original SQL cannot be recovered, create a clearly labelled **new baseline/reconciliation migration** from a complete catalog export and review it as a reconstructed artifact. Do not label it as the original migration history.

## Safety boundary

This audit and catalog inspection are read-only. No production schema, credentials, account settings, deployment, or live trading flags were changed. No broker order was submitted. Live-account compatibility remains required; it is not a reason to remove safeguards or silently redirect users to demo.
