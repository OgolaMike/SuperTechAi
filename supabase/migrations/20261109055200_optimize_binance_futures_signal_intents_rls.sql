alter policy "Users can read own futures signal intents"
on public.binance_futures_signal_intents
using ((select auth.uid()) = user_id);
