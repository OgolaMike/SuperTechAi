# Binance USD-M Futures market universe

SuperTech AI Futures discovery is independent of Binance Spot discovery. It reads Binance USD-M Futures `exchangeInfo`, includes every `TRADING` `PERPETUAL` contract margined and quoted in USDT, and fetches candles from the USD-M Futures klines endpoint. It does not inherit the Spot top-100 list or any manual member asset cap.

An empty or null member `allowed_symbols` setting means all eligible contracts. A non-empty setting is an explicit member restriction. The scanner rotates through the full eligible universe within its server time budget, and the executor independently validates each contract against exchange metadata before any order is submitted.

Live orders remain protected by member opt-in, emergency stop, daily loss and position limits, exchange precision/minimum-notional checks, and verified protective orders. API withdrawals remain disabled.
