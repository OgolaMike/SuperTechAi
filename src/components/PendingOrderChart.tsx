import type { Candle } from '@/lib/deriv';
import { formatPrice } from '@/lib/sma';

type Props = {
  candles: Candle[];
  entry: number;
  stopLoss: number;
  takeProfit: number;
  currentPrice: number;
  digits: number;
  direction: 'BUY' | 'SELL';
  symbol: string;
};

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 16, right: 94, bottom: 18, left: 12 };

export function PendingOrderChart({ candles, entry, stopLoss, takeProfit, currentPrice, digits, direction, symbol }: Props) {
  const data = candles.slice(-60);
  if (data.length < 2) {
    return <div className="rounded-xl border border-white/10 bg-[#0b1220] px-4 py-6 text-center text-xs text-slate-400">Chart snapshot will appear when M15 candle history is available.</div>;
  }

  const values = data.flatMap((candle) => [candle.high, candle.low]).concat([entry, stopLoss, takeProfit, currentPrice]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, Math.abs(max) * 0.00001, 0.000001);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + (index / Math.max(data.length - 1, 1)) * plotW;
  const y = (price: number) => PAD.top + ((max - price) / range) * plotH;
  const spacing = plotW / Math.max(data.length - 1, 1);
  const bodyW = Math.max(2, Math.min(9, spacing * 0.68));
  const orderLines = [
    { label: 'ENTRY', value: entry, color: '#60a5fa', dash: '4 3' },
    { label: 'STOP LOSS', value: stopLoss, color: '#fb7185', dash: '4 3' },
    { label: 'TAKE PROFIT', value: takeProfit, color: '#4ade80', dash: '4 3' },
    { label: 'MARKET', value: currentPrice, color: '#facc15', dash: '2 3' },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-white/10 bg-[#0b1220] text-white" aria-label={`Pending order chart snapshot for ${symbol}`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-xs font-semibold tracking-wide text-white">M15 ORDER SNAPSHOT</span>
        <span className={`rounded px-2 py-1 text-[10px] font-bold ${direction === 'BUY' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300'}`}>{direction} · {symbol}</span>
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Candlestick chart showing entry, stop-loss, take-profit and current market price lines" className="block w-full" style={{ minWidth: '440px' }}>
          {[0, 1, 2, 3].map((step) => {
            const gy = PAD.top + (plotH * step) / 3;
            const price = max - (range * step) / 3;
            return <g key={step}><line x1={PAD.left} x2={WIDTH - PAD.right} y1={gy} y2={gy} stroke="#94a3b8" strokeOpacity="0.16" strokeDasharray="3 5" /><text x={WIDTH - PAD.right + 7} y={gy + 3} fill="#94a3b8" fontSize="10">{formatPrice(price, digits)}</text></g>;
          })}
          {orderLines.map((line) => <g key={line.label}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(line.value)} y2={y(line.value)} stroke={line.color} strokeWidth="1.5" strokeDasharray={line.dash} />
            <text x={PAD.left + 4} y={Math.max(PAD.top + 10, y(line.value) - 4)} fill={line.color} fontSize="9" fontWeight="700">{line.label}</text>
          </g>)}
          {data.map((candle, index) => {
            const up = candle.close >= candle.open;
            const color = up ? '#22c55e' : '#f43f5e';
            const top = y(Math.max(candle.open, candle.close));
            const bottom = y(Math.min(candle.open, candle.close));
            return <g key={candle.epoch}>
              <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} stroke={color} strokeWidth="1.2" />
              <rect x={x(index) - bodyW / 2} y={top} width={bodyW} height={Math.max(1.5, bottom - top)} rx="0.6" fill={color} />
            </g>;
          })}
          <text x={PAD.left + 2} y={HEIGHT - 4} fill="#64748b" fontSize="9">SUPERTECH AI · PENDING ORDER LEVELS</text>
        </svg>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-white/10 px-3 py-2 text-[10px] text-slate-300">
        {orderLines.map((line) => <span key={line.label} className="flex items-center gap-1.5"><i className="h-0.5 w-3" style={{ backgroundColor: line.color }} />{line.label}: {formatPrice(line.value, digits)}</span>)}
      </div>
    </section>
  );
}
