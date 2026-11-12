# cTrader migration parity audit

Audit date: 2026-11-12  
Repository branch: `automation/unified-mobile-cloud`  
Supabase project: `jtfsqhewotinvlrcadwq`

## Finding

The active Supabase project reports these cTrader migrations as applied:

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

The development branch migration directory contains only:

- `20261107061620_optimize_ctrader_rls_auth_uid_initplans.sql`

That filename/version does not match the applied migration version, and the eight foundational/hardening migrations are absent from the branch.

## Why this blocks execution work

The cTrader cloud reconcile function and future order executor depend on the connection, OAuth vault, settings, runtime lease, intent, and event tables plus their security-definer claim/arming functions and RLS policies. A clean database created from the repository cannot currently reproduce the schema that exists in the active Supabase project.

Do not deploy the cTrader executor or run a fresh environment migration until the missing source migrations have been recovered and reviewed. Do not try to repair this by applying duplicate table-creation SQL to the active project.

## Recovery plan

1. Recover the exact original SQL for all nine applied cTrader migrations from the authoritative migration source or a trusted backup.
2. Restore the exact versioned files to `supabase/migrations`, preserving their original order and contents.
3. Remove or reconcile the branch's mismatched `20261107061620` file only after comparing its SQL with the applied `20261107061617` migration. Do not rename blindly.
4. Rebuild a clean disposable Supabase branch/database from repository migrations.
5. Compare table definitions, indexes, constraints, RLS policies, grants, triggers, and security-definer function bodies against the active project's cTrader schema.
6. Only then continue with the protected live/demo order executor.

## Safety boundary

This audit is documentation only. It makes no database changes, does not alter production settings or credentials, does not deploy Edge Functions, and does not submit broker orders. Live-account support remains a requirement; this migration gap is a release blocker, not a reason to force demo-only behavior.
