-- The third-and-later 50% referral allocation is 30% direct + 20% Infinity,
-- never a 50% direct commission. Infinity remains in its own ledger pool until
-- the qualified 2x2 matrix identifies its single eligible recipient.
do $$
declare
  v_definition text;
  v_old text := '  if v_direct_count>=2 then
    v_direct_pct:=v_settings.third_plus_direct_pct;
    v_infinity_pct:=0;
  else
    v_direct_pct:=v_settings.direct_pct;
    v_infinity_pct:=v_settings.infinity_pct;
  end if;';
  v_new text := '  v_direct_pct:=v_settings.direct_pct;
  v_infinity_pct:=v_settings.infinity_pct;';
begin
  v_definition := pg_get_functiondef('public.finance_settle_membership(uuid,text,jsonb)'::regprocedure);
  if position(v_old in v_definition)=0 then
    raise exception 'Expected referral allocation block was not found; refusing to alter finance settlement logic';
  end if;
  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$$;
