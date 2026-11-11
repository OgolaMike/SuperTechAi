-- Keep exchange API credentials and per-member execution settings server-side only.
-- The OKX UI reads and writes these records through authenticated Edge Functions;
-- Edge Functions use service_role, which retains the required privileges.
REVOKE ALL PRIVILEGES ON TABLE public.okx_futures_credentials FROM anon, authenticated, PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.okx_futures_settings FROM anon, authenticated, PUBLIC;
