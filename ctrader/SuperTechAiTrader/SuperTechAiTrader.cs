using System;
using System.Globalization;
using System.Linq;
using cAlgo.API;
using cAlgo.API.Indicators;
using cAlgo.API.Internals;

namespace cAlgo.Robots
{
    [Robot(TimeZone = TimeZones.UTC, AccessRights = AccessRights.None)]
    public class SuperTechAiTrader : Robot
    {
        private const string BotLabel = "SuperTechAiTrader";
        private const int SmaPeriod = 60;
        private const double BandDeviation = 2.5;
        private Bars _m1 = null!;
        private Bars _m5 = null!;
        private Bars _m15 = null!;
        private Bars _m30 = null!;
        private Bars _h1 = null!;
        private Bars _h4 = null!;
        private Bars _d1 = null!;
        private Bars _w1 = null!;
        private BollingerBands _bbM1 = null!;
        private BollingerBands _bbM5 = null!;
        private BollingerBands _bbM15 = null!;
        private BollingerBands _bbM30 = null!;
        private BollingerBands _bbH1 = null!;
        private BollingerBands _bbH4 = null!;
        private BollingerBands _bbD1 = null!;
        private BollingerBands _bbW1 = null!;
        private DateTime _riskDay;
        private double _dayStartEquity;
        private bool _dailyLocked;

        [Parameter("Enable trading", DefaultValue = false, Group = "Safety")]
        public bool EnableTrading { get; set; }

        [Parameter("Allow live account", DefaultValue = false, Group = "Safety")]
        public bool AllowLiveAccount { get; set; }

        [Parameter("Risk per trade (%)", DefaultValue = 0.5, MinValue = 0.1, MaxValue = 1.0, Step = 0.1, Group = "Risk")]
        public double RiskPercent { get; set; }

        [Parameter("Maximum daily loss (%)", DefaultValue = 2.0, MinValue = 0.5, MaxValue = 5.0, Step = 0.5, Group = "Risk")]
        public double MaxDailyLossPercent { get; set; }

        [Parameter("Maximum spread (pips)", DefaultValue = 0, MinValue = 0, Group = "Risk")]
        public double MaxSpreadPips { get; set; }

        [Parameter("Maximum open positions", DefaultValue = 1, MinValue = 1, MaxValue = 3, Group = "Risk")]
        public int MaxOpenPositions { get; set; }

        protected override void OnStart()
        {
            if (TimeFrame != TimeFrame.Minute5)
            {
                Print("Attach SuperTechAi Trader to an M15 chart. Trading is disabled.");
                Stop();
                return;
            }

            _m1 = MarketData.GetBars(TimeFrame.Minute, SymbolName);
            _m5 = MarketData.GetBars(TimeFrame.Minute5, SymbolName);
            _m15 = Bars;
            _m30 = MarketData.GetBars(TimeFrame.Minute30, SymbolName);
            _h1 = MarketData.GetBars(TimeFrame.Hour, SymbolName);
            _h4 = MarketData.GetBars(TimeFrame.Hour4, SymbolName);
            _d1 = MarketData.GetBars(TimeFrame.Daily, SymbolName);
            _w1 = MarketData.GetBars(TimeFrame.Weekly, SymbolName);

            _bbM1 = CreateBands(_m1);
            _bbM5 = CreateBands(_m5);
            _bbM15 = CreateBands(_m15);
            _bbM30 = CreateBands(_m30);
            _bbH1 = CreateBands(_h1);
            _bbH4 = CreateBands(_h4);
            _bbD1 = CreateBands(_d1);
            _bbW1 = CreateBands(_w1);

            _riskDay = Server.Time.Date;
            _dayStartEquity = Account.Equity;
            _dailyLocked = false;

            Print("SuperTechAi Trader started on {0} ({1}). Account: {2}. Trading enabled: {3}.",
                SymbolName, TimeFrame, Account.IsLive ? "LIVE" : "DEMO", EnableTrading);
            Print("Eight timeframe engine loaded: M1, M5, M15, M30, H1, H4, D1, W1. SMA60 / Bollinger 2.5σ.");
            Print("Cloud instance runs independently of your phone. Keep Enable trading OFF until demo checks are complete.");

            Timer.Start(1);
        }

        private BollingerBands CreateBands(Bars bars)
        {
            return Indicators.BollingerBands(bars.ClosePrices, SmaPeriod, BandDeviation, MovingAverageType.Simple);
        }

        protected override void OnBar()
        {
            if (Bars.Count < SmaPeriod + 3)
                return;

            ManagePositions();

            var i = _m15.Count - 2;
            var previous = i - 1;
            if (i < SmaPeriod || previous < SmaPeriod)
                return;

            var closeNow = _m15.ClosePrices[i];
            var closePrevious = _m15.ClosePrices[previous];
            var meanNow = _bbM15.Main[i];
            var meanPrevious = _bbM15.Main[previous];
            var deviationNow = (_bbM15.Top[i] - meanNow) / BandDeviation;

            TradeType? direction = null;
            if (closePrevious <= meanPrevious && closeNow > meanNow)
                direction = TradeType.Buy;
            else if (closePrevious >= meanPrevious && closeNow < meanNow)
                direction = TradeType.Sell;

            if (direction == null)
                return;

            var bias = GetEightTimeframeBias();
            var expected = direction == TradeType.Buy ? 1 : -1;
            if (bias != expected)
            {
                Print("M15 {0} crossover ignored: eight-timeframe confluence is not aligned.", direction);
                return;
            }

            var sign = expected;
            var initialStop = meanNow - sign * deviationNow;
            var firstTarget = meanNow + sign * deviationNow;
            var target = meanNow + sign * BandDeviation * deviationNow;
            if (deviationNow <= 0 || sign * (firstTarget - closeNow) <= 0 || sign * (target - closeNow) <= 0)
            {
                Print("Signal skipped: price has already moved beyond the valid entry zone.");
                return;
            }

            Print("8/8 CONFIRMED {0} {1} | Entry ref {2} | SL {3} | TP {4}",
                direction, SymbolName, closeNow, initialStop, target);

            if (!EnableTrading)
            {
                Print("Signal only. Enable trading is OFF.");
                return;
            }

            if (Account.IsLive && !AllowLiveAccount)
            {
                Print("LIVE ACCOUNT BLOCKED. Allow live account is OFF.");
                return;
            }

            if (IsDailyLossLimitReached())
            {
                Print("Daily loss limit reached. New entries are blocked until the next UTC day or a restart.");
                return;
            }

            if (MaxSpreadPips > 0 && Symbol.Spread / Symbol.PipSize > MaxSpreadPips)
            {
                Print("Entry blocked: spread exceeds configured limit.");
                return;
            }

            if (Positions.FindAll(BotLabel, SymbolName).Length >= MaxOpenPositions)
            {
                Print("Entry blocked: maximum SuperTechAi Trader positions already open.");
                return;
            }

            OpenPosition(direction.Value, closeNow, initialStop, target, meanNow, deviationNow);
        }

        protected override void OnTick()
        {
            ManagePositions();
        }

        protected override void OnTimer()
        {
            if (Server.Time.Date != _riskDay)
            {
                _riskDay = Server.Time.Date;
                _dayStartEquity = Account.Equity;
                _dailyLocked = false;
                Print("New UTC trading day. Daily risk baseline reset.");
            }

            if (IsDailyLossLimitReached())
            {
                _dailyLocked = true;
                Print("Daily loss protection active. New entries blocked.");
            }
        }

        private int GetEightTimeframeBias()
        {
            var reads = new[]
            {
                ReadBias(_m1, _bbM1), ReadBias(_m5, _bbM5), ReadBias(_m15, _bbM15),
                ReadBias(_m30, _bbM30), ReadBias(_h1, _bbH1), ReadBias(_h4, _bbH4),
                ReadBias(_d1, _bbD1), ReadBias(_w1, _bbW1)
            };

            if (reads.Any(value => value == 0))
                return 0;

            return reads.All(value => value == 1) ? 1 :
                   reads.All(value => value == -1) ? -1 : 0;
        }

        private int ReadBias(Bars bars, BollingerBands bands)
        {
            var index = bars.Count - 2; // completed candle only
            if (index < SmaPeriod)
                return 0;

            var close = bars.ClosePrices[index];
            var mean = bands.Main[index];
            var deviation = (bands.Top[index] - mean) / BandDeviation;
            if (deviation <= 0)
                return 0;

            var distance = close - mean;
            var neutralZone = deviation * 0.1;
            if (distance > neutralZone)
                return 1;
            if (distance < -neutralZone)
                return -1;
            return 0;
        }

        private bool IsDailyLossLimitReached()
        {
            if (_dailyLocked || _dayStartEquity <= 0)
                return _dailyLocked;

            var lossPercent = Math.Max(0, (_dayStartEquity - Account.Equity) / _dayStartEquity * 100.0);
            return lossPercent >= MaxDailyLossPercent;
        }

        private void OpenPosition(TradeType tradeType, double entryReference, double stopPrice,
            double targetPrice, double mean, double deviation)
        {
            var marketEntry = tradeType == TradeType.Buy ? Symbol.Ask : Symbol.Bid;
            var stopDistancePips = Math.Abs(marketEntry - stopPrice) / Symbol.PipSize;
            var targetDistancePips = Math.Abs(targetPrice - marketEntry) / Symbol.PipSize;
            if (stopDistancePips <= 0 || targetDistancePips <= 0)
            {
                Print("Entry blocked: invalid broker-side stop/target distance.");
                return;
            }

            var riskAmount = Account.Equity * (RiskPercent / 100.0);
            var volume = Symbol.VolumeForFixedRisk(riskAmount, stopDistancePips, RoundingMode.Down);
            volume = Symbol.NormalizeVolumeInUnits(volume, RoundingMode.Down);
            if (volume < Symbol.VolumeInUnitsMin)
            {
                Print("Entry blocked: calculated volume is below this broker symbol's minimum.");
                return;
            }

            var comment = string.Join("|", new[]
            {
                "STAI", mean.ToString("R", CultureInfo.InvariantCulture),
                deviation.ToString("R", CultureInfo.InvariantCulture),
                entryReference.ToString("R", CultureInfo.InvariantCulture)
            });

            var result = ExecuteMarketOrder(tradeType, SymbolName, volume, BotLabel,
                stopDistancePips, targetDistancePips, comment);

            if (result.IsSuccessful)
                Print("DEMO/TRADE ORDER ACCEPTED: {0} {1} units. Initial SL and TP are broker-side.", tradeType, volume);
            else
                Print("ORDER REJECTED: {0}", result.Error);
        }

        private void ManagePositions()
        {
            foreach (var position in Positions.FindAll(BotLabel, SymbolName))
            {
                if (!TryReadTradeContext(position.Comment, out var mean, out var deviation))
                    continue;

                var sign = position.TradeType == TradeType.Buy ? 1.0 : -1.0;
                var current = position.TradeType == TradeType.Buy ? Symbol.Bid : Symbol.Ask;
                var favourableMove = sign * (current - position.EntryPrice);
                var stage = favourableMove >= 3 * deviation ? 3 :
                            favourableMove >= 2 * deviation ? 2 :
                            favourableMove >= 1 * deviation ? 1 : 0;
                if (stage == 0)
                    continue;

                var stopSigma = stage == 1 ? 0.0 : stage == 2 ? 1.0 : 1.5;
                var nextStop = mean + sign * stopSigma * deviation;
                var currentStop = position.StopLoss;
                var improves = currentStop == null ||
                    (position.TradeType == TradeType.Buy && nextStop > currentStop.Value) ||
                    (position.TradeType == TradeType.Sell && nextStop < currentStop.Value);
                if (!improves)
                    continue;

                var currentIndex = _m15.Count - 2;
                if (currentIndex < SmaPeriod)
                    continue;
                var liveMean = _bbM15.Main[currentIndex];
                var liveDeviation = (_bbM15.Top[currentIndex] - liveMean) / BandDeviation;
                if (liveDeviation <= 0)
                    continue;
                var updatedTarget = liveMean + sign * BandDeviation * liveDeviation;

                if ((position.TradeType == TradeType.Buy && (nextStop >= current || updatedTarget <= current)) ||
                    (position.TradeType == TradeType.Sell && (nextStop <= current || updatedTarget >= current)))
                    continue;

                var modify = ModifyPosition(position, nextStop, updatedTarget, ProtectionType.Absolute);
                if (modify.IsSuccessful)
                    Print("TRAILING STAGE {0}: stop advanced and 2.5σ target recalculated.", stage);
                else
                    Print("Could not update trailing protection for position {0}: {1}", position.Id, modify.Error);
            }
        }

        private bool TryReadTradeContext(string? comment, out double mean, out double deviation)
        {
            mean = 0;
            deviation = 0;
            if (string.IsNullOrWhiteSpace(comment))
                return false;

            var parts = comment.Split('|');
            return parts.Length >= 3 &&
                   parts[0] == "STAI" &&
                   double.TryParse(parts[1], NumberStyles.Float, CultureInfo.InvariantCulture, out mean) &&
                   double.TryParse(parts[2], NumberStyles.Float, CultureInfo.InvariantCulture, out deviation) &&
                   deviation > 0;
        }

        protected override void OnStop()
        {
            Timer.Stop();
            Print("SuperTechAi Trader stopped. Any open positions retain their broker-side SL/TP.");
        }
    }
}
