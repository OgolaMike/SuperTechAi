-- Tighten governance SECURITY DEFINER RPC exposure without changing authenticated RLS access.
-- The audit function is trigger-only; existing triggers continue to execute it.
ALTER FUNCTION public.governance_audit_trigger() SET search_path = '';
ALTER FUNCTION public.is_governance_admin() SET search_path = '';
ALTER FUNCTION public.is_governance_owner() SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.governance_audit_trigger() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_governance_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_governance_owner() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_governance_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_governance_owner() TO authenticated;
