alter table public.mt5_bridge_commands
  drop constraint if exists mt5_bridge_commands_command_type_check;
alter table public.mt5_bridge_commands
  add constraint mt5_bridge_commands_command_type_check
  check (command_type in (
    'sync_account','list_pending_orders','list_positions',
    'preflight_pending_order','place_pending_order',
    'modify_owned_order','cancel_owned_order','manage_owned_position','pause_trading'
  ));
comment on column public.mt5_bridge_commands.payload is
  'Contains validated trade proposal inputs only. preflight_pending_order is a dry-run validation command and must never call order_send.';
