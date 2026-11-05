-- Permit the ownership-checked SECURITY DEFINER arming RPC to set protected fields.
-- Direct authenticated table writes remain blocked by this trigger.
create or replace function public.guard_ctrader_execution_settings()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user = 'authenticated' then
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

revoke all on function public.guard_ctrader_execution_settings() from public, anon, authenticated;
