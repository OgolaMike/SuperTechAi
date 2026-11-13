-- Add covering indexes for foreign-key columns identified by the production
-- Supabase performance advisor. Existing indexes are retained; no index is dropped.
create index if not exists academy_ai_discussion_topics_generated_by_idx on public.academy_ai_discussion_topics (generated_by);
create index if not exists academy_ai_discussions_lesson_id_idx on public.academy_ai_discussions (lesson_id);
create index if not exists academy_ai_lessons_generated_by_idx on public.academy_ai_lessons (generated_by);
create index if not exists academy_trade_discussions_user_id_idx on public.academy_trade_discussions (user_id);
create index if not exists academy_trade_reviews_verified_by_idx on public.academy_trade_reviews (verified_by);
create index if not exists academy_videos_created_by_idx on public.academy_videos (created_by);
create index if not exists ctrader_execution_events_connection_id_idx on public.ctrader_execution_events (connection_id);
create index if not exists ctrader_execution_events_intent_id_idx on public.ctrader_execution_events (intent_id);
create index if not exists ctrader_execution_settings_connection_user_idx on public.ctrader_execution_settings (connection_id, user_id);
create index if not exists ctrader_execution_settings_user_id_idx on public.ctrader_execution_settings (user_id);
create index if not exists ctrader_oauth_states_user_id_idx on public.ctrader_oauth_states (user_id);
create index if not exists ctrader_positions_intent_id_idx on public.ctrader_positions (intent_id);
create index if not exists ctrader_positions_user_id_idx on public.ctrader_positions (user_id);
create index if not exists governance_announcement_reads_user_id_idx on public.governance_announcement_reads (user_id);
create index if not exists governance_announcements_published_by_idx on public.governance_announcements (published_by);
create index if not exists governance_audit_log_actor_id_idx on public.governance_audit_log (actor_id);
create index if not exists governance_discussions_created_by_idx on public.governance_discussions (created_by);
create index if not exists governance_owners_added_by_idx on public.governance_owners (added_by);
create index if not exists governance_proposals_created_by_idx on public.governance_proposals (created_by);
create index if not exists governance_votes_voter_id_idx on public.governance_votes (voter_id);
create index if not exists just4you_weekly_draws_winner_user_id_idx on public.just4you_weekly_draws (winner_user_id);
create index if not exists marketing_campaigns_user_id_idx on public.marketing_campaigns (user_id);
create index if not exists okx_futures_orders_intent_id_idx on public.okx_futures_orders (intent_id);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
