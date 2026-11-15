create table if not exists public.nfc_member_cards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  card_code text not null unique,
  display_name text not null,
  card_type text not null default 'standard' check (card_type = 'standard'),
  status text not null default 'active' check (status in ('active','suspended','revoked','replaced')),
  issued_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_tapped_at timestamptz
);
create unique index if not exists nfc_one_active_card_per_member on public.nfc_member_cards(owner_user_id) where status = 'active';
create index if not exists nfc_member_cards_owner_idx on public.nfc_member_cards(owner_user_id, created_at desc);
create table if not exists public.nfc_tap_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.nfc_member_cards(id) on delete cascade,
  event_type text not null check (event_type in ('profile_view','referral_open','member_portal','event_checkin')),
  event_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists nfc_tap_events_card_created_idx on public.nfc_tap_events(card_id, created_at desc);
create index if not exists nfc_tap_events_created_idx on public.nfc_tap_events(created_at desc);
create table if not exists public.nfc_community_events (
  id uuid primary key default gen_random_uuid(),
  event_code text not null unique,
  title text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'scheduled' check (status in ('scheduled','active','completed','cancelled')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.nfc_event_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.nfc_community_events(id) on delete cascade,
  card_id uuid not null references public.nfc_member_cards(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  unique(event_id, member_user_id)
);
create index if not exists nfc_event_attendance_event_idx on public.nfc_event_attendance(event_id, checked_in_at desc);
alter table public.nfc_member_cards enable row level security;
alter table public.nfc_tap_events enable row level security;
alter table public.nfc_community_events enable row level security;
alter table public.nfc_event_attendance enable row level security;
revoke all on public.nfc_member_cards from anon, authenticated;
revoke all on public.nfc_tap_events from anon, authenticated;
revoke all on public.nfc_community_events from anon, authenticated;
revoke all on public.nfc_event_attendance from anon, authenticated;
grant all on public.nfc_member_cards to service_role;
grant all on public.nfc_tap_events to service_role;
grant all on public.nfc_community_events to service_role;
grant all on public.nfc_event_attendance to service_role;
