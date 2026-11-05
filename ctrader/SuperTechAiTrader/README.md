# SuperTechAi Trader — cTrader Cloud cBot

This is the cTrader-native execution build for SuperTech AI. It is designed to run as a **cTrader Cloud instance**, so the member's phone or PC does not need to stay online and no Windows VPS is required.

## Current strategy port

- M15 candle-close crossover of the 60-period Simple Moving Average.
- Bollinger Bands use 60 periods and 2.5 standard deviations.
- Eight completed timeframes must align: M1, M5, M15, M30, H1, H4, D1 and W1.
- Initial stop: one standard deviation beyond the SMA in the adverse direction.
- One final target: 2.5 standard deviations from the SMA.
- Position size is calculated from account equity and the configured risk percentage.
- One position per symbol by default.
- Staged stop management: initial -1σ; then 0σ, +1σ and +1.5σ as price advances by 1σ steps. The 2.5σ target is recalculated when the stop advances.
- Candle-close entries only. The cBot uses the broker's own cTrader candles and symbol specifications, not Deriv's separate feed.

## Safety defaults

- `Enable trading` defaults to **false**.
- `Allow live account` defaults to **false**.
- Risk defaults to 0.5% per trade; maximum parameter value is 1%.
- Daily loss lock defaults to 2% from the cBot instance's start-of-day baseline.
- Spread filter is optional; zero means no spread ceiling is applied.
- Broker-side SL and TP are attached to the initial market order.

**Important cloud limitation:** cTrader documents that Cloud LocalStorage is in-memory only and does not persist across instance restarts. Consequently, the daily-loss baseline in this initial build resets if the cloud instance restarts. Do not treat that guard as restart-proof. Keep this build on demo while we harden and test persistent daily risk accounting and trade lifecycle recovery. Open positions retain broker-side SL/TP if the bot stops.

## Attach and run

1. Open the cTrader demo account that you created with Deriv.
2. Import the compiled `.algo` file into cTrader.
3. Add SuperTechAi Trader to the Deriv instrument chart using **M15**.
4. Keep `Enable trading = false` for the first run. Confirm all eight timeframes load and that the log reports 8/8 signals only on completed candles.
5. For demo execution testing, enable `Enable trading`, leave `Allow live account = false`, and start a cTrader **Cloud** instance.
6. Check the cBot log, open positions and broker-side SL/TP after every test order.

cTrader Cloud runs cBots 24/7 without a VPS. Official documentation currently states a maximum of one concurrent demo cloud instance, with demo instances stopping automatically after seven days; live accounts support up to ten concurrent cloud instances, subject to broker-specific rules.

## Build

Install the .NET SDK and restore the official `cTrader.Automate` NuGet package:

```bash
dotnet restore
dotnet build --configuration Release
```

The cTrader.Automate package creates the `.algo` output during build. See the official cTrader IDE guide:
https://help.ctrader.com/ctrader-algo/documentation/visual-studio-ides/

## Scope boundary

This cBot runs the core signal and execution logic inside cTrader Cloud. It does **not yet receive the SuperTech AI web app's signal stream**; cTrader Cloud does not support ordinary HTTP requests from cBots. The strategy logic is being ported to the broker's own data so execution remains fully cloud-hosted. It is not yet production-approved and must pass demo backtesting and forward testing first.
