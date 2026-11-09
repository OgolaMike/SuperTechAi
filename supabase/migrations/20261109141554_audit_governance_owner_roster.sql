drop trigger if exists governance_owners_audit on public.governance_owners;
create trigger governance_owners_audit after insert or update or delete on public.governance_owners for each row execute function public.governance_audit_trigger();
