create table if not exists public.academy_trade_reviews (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 symbol text not null,
 direction text not null check (direction in ('BUY','SELL')),
 timeframe text not null,
 opened_at timestamptz,
 closed_at timestamptz,
 entry_price numeric not null,
 exit_price numeric not null,
 realized_pnl numeric,
 realized_pnl_pct numeric,
 setup_summary text not null,
 why_entry text not null,
 what_confirmed text not null,
 risk_lesson text not null,
 chart_image_url text,
 source_trade_ref text,
 verified_by uuid references auth.users(id),
 published boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists academy_trade_reviews_source_ref_idx on public.academy_trade_reviews(source_trade_ref) where source_trade_ref is not null;
create index if not exists academy_trade_reviews_published_idx on public.academy_trade_reviews(published, created_at desc);
alter table public.academy_trade_reviews enable row level security;
grant select on public.academy_trade_reviews to authenticated;
drop policy if exists "members view published academy trade reviews" on public.academy_trade_reviews;
create policy "members view published academy trade reviews" on public.academy_trade_reviews for select to authenticated using (published = true);

create table if not exists public.academy_trade_discussions (
 id uuid primary key default gen_random_uuid(),
 review_id uuid not null references public.academy_trade_reviews(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 comment text not null check (char_length(comment) between 2 and 1200),
 created_at timestamptz not null default now()
);
create index if not exists academy_trade_discussions_review_idx on public.academy_trade_discussions(review_id, created_at asc);
alter table public.academy_trade_discussions enable row level security;
grant select, insert on public.academy_trade_discussions to authenticated;
drop policy if exists "members view discussions on published trade reviews" on public.academy_trade_discussions;
create policy "members view discussions on published trade reviews" on public.academy_trade_discussions for select to authenticated using (exists (select 1 from public.academy_trade_reviews r where r.id = review_id and r.published = true));
drop policy if exists "approved members comment on published trade reviews" on public.academy_trade_discussions;
create policy "approved members comment on published trade reviews" on public.academy_trade_discussions for insert to authenticated with check (user_id = auth.uid() and exists (select 1 from public.member_access m where m.user_id = auth.uid()) and exists (select 1 from public.academy_trade_reviews r where r.id = review_id and r.published = true));
