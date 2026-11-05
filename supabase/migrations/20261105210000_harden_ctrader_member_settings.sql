-- Prevent clients from altering ownership and server-controlled execution permissions.
-- Members can choose whether to arm automation, but cannot change account ownership
-- or grant themselves live execution/unattended privileges through direct table writes.
revoke insert, update on public.ctrader_execution_settings from authenticated;
grant select on public.ctrader_execution_settings to authenticated;
grant update (
  automation_enabled,
  risk_per_trade_percent,
  daily_loss_limit_percent,
  max_open_positions,
  max_spread_pips,
  allowed_symbols,
  strategy_version
) on public.ctrader_execution_settings to authenticated;

create or replace function public.guard_ctrader_execution_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      raise exception 'ctrader_settings_server_managed';
    end if;
    if new.connection_id is distinct from old.connection_id
       or new.user_id is distinct from old.user_id
       or new.unattended_execution_enabled is distinct from old.unattended_execution_enabled
       or new.allow_live_execution is distinct from old.allow_live_execution then
      raise exception 'ctrader_protected_setting';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guard_ctrader_execution_settings on public.ctrader_execution_settings;
create trigger guard_ctrader_execution_settings
before insert or update on public.ctrader_execution_settings
for each row execute function public.guard_ctrader_execution_settings();

revoke all on function public.guard_ctrader_execution_settings() from public, anon, authenticated;
