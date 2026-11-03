create or replace function public.set_mt5_trade_adoption(
  p_user_id uuid,
  p_object_type text,
  p_ticket bigint,
  p_adopt boolean
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_login text;
  v_server text;
  v_allowed boolean;
  v_previous text;
  v_next text;
begin
  if p_object_type not in ('pending_order','position') or p_ticket <= 0 then
    raise exception 'invalid_inventory_identity';
  end if;

  select login, server,
    case when p_object_type = 'pending_order' then adopt_pending_orders
         else manage_existing_positions end
    into v_login, v_server, v_allowed
  from public.mt5_account_settings
  where user_id = p_user_id;
  if not found then raise exception 'mt5_account_not_paired'; end if;
  if not coalesce(v_allowed, false) then raise exception 'adoption_permission_not_enabled'; end if;

  select ownership_status into v_previous
  from public.mt5_trade_inventory
  where user_id = p_user_id and account_login = v_login and account_server = v_server
    and object_type = p_object_type and ticket = p_ticket
  for update;
  if not found then raise exception 'inventory_item_not_found'; end if;

  if p_adopt then
    if v_previous not in ('discovered_unowned','strategy_tagged_unverified') then
      raise exception 'inventory_ownership_state_conflict';
    end if;
    v_next := 'explicitly_adopted';
  else
    if v_previous <> 'explicitly_adopted' then
      raise exception 'inventory_ownership_state_conflict';
    end if;
    v_next := 'discovered_unowned';
  end if;

  update public.mt5_trade_inventory set ownership_status = v_next
  where user_id = p_user_id and account_login = v_login and account_server = v_server
    and object_type = p_object_type and ticket = p_ticket;

  insert into public.mt5_trade_adoption_audit(
    user_id, account_login, account_server, object_type, ticket, action, previous_status, new_status
  ) values (
    p_user_id, v_login, v_server, p_object_type, p_ticket,
    case when p_adopt then 'adopt' else 'revoke' end, v_previous, v_next
  );
  return v_next;
end;
$$;

revoke all on function public.set_mt5_trade_adoption(uuid,text,bigint,boolean) from public, anon, authenticated;
grant execute on function public.set_mt5_trade_adoption(uuid,text,bigint,boolean) to service_role;
