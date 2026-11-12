import type { Candle } from "./deriv.ts";
type Direction = "BUY" | "SELL";
export type HighRocStopSignal = { symbol:string; direction:Direction; signalEpoch:number; timeframe:"M15"; orderType:"BUY_STOP"|"SELL_STOP"; currentPrice:number; entry:number; stopLoss:number; takeProfit:number; roc3:number; roc6:number; roc12:number; roc12Threshold:number; strength:"HIGH"|"VERY_HIGH"; expiresAtEpoch:number; strategyVersion:"high-roc-stop-v1"; idempotencyKey:string; };
function roc(values:number[], periods:number):number|null { if(values.length<=periods)return null; const previous=values[values.length-1-periods],latest=values[values.length-1]; if(!(previous>0)||!Number.isFinite(latest))return null; return ((latest-previous)/previous)*100; }
function percentile(values:number[],p:number):number { const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b); return sorted.length?sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))]:Number.POSITIVE_INFINITY; }
/** Closed-candle, adaptive-momentum STOP-entry signal proposal. No order execution. */
export function buildHighRocStopSignal(symbol:string,candles:Candle[],nowEpoch:number):HighRocStopSignal|null {
 const closed=candles.filter(c=>c.epoch+900<=nowEpoch).sort((a,b)=>a.epoch-b.epoch); if(closed.length<100)return null;
 const latest=closed[closed.length-1]; if(nowEpoch-(latest.epoch+900)>1800)return null; const closes=closed.map(c=>c.close);
 const r3=roc(closes,3),r6=roc(closes,6),r12=roc(closes,12); if(r3===null||r6===null||r12===null)return null;
 const sign=Math.sign(r12); if(!sign||Math.sign(r3)!==sign||Math.sign(r6)!==sign)return null;
 const history:number[]=[]; for(let end=Math.max(12,closes.length-97);end<closes.length-1;end++){const v=roc(closes.slice(0,end+1),12);if(v!==null)history.push(Math.abs(v));}
 if(history.length<60)return null; const threshold=percentile(history,0.85); if(Math.abs(r12)<threshold)return null;
 const prior=closed.slice(-4,-1); if(prior.length!==3)return null; const priorHigh=Math.max(...prior.map(c=>c.high??c.close)),priorLow=Math.min(...prior.map(c=>c.low??c.close));
 const high=latest.high??latest.close,low=latest.low??latest.close; if(sign>0?latest.close<=priorHigh:latest.close>=priorLow)return null;
 const ranges=closed.slice(-15).map((c,i,a)=>{const h=c.high??c.close,l=c.low??c.close,pc=i?a[i-1].close:(c.open??c.close);return Math.max(h-l,Math.abs(h-pc),Math.abs(l-pc));});
 const atr=ranges.reduce((a,b)=>a+b,0)/ranges.length; if(!(atr>0)||!Number.isFinite(atr))return null;
 const direction:Direction=sign>0?"BUY":"SELL",buffer=atr*0.05,entry=direction==="BUY"?high+buffer:low-buffer;
 const swingLow=Math.min(...closed.slice(-4).map(c=>c.low??c.close)),swingHigh=Math.max(...closed.slice(-4).map(c=>c.high??c.close));
 const stopLoss=direction==="BUY"?swingLow-atr*0.1:swingHigh+atr*0.1,risk=Math.abs(entry-stopLoss);
 if(!(entry>0&&stopLoss>0&&risk>0))return null; const takeProfit=direction==="BUY"?entry+2*risk:entry-2*risk; if(!(takeProfit>0))return null;
 const signalEpoch=latest.epoch,key=symbol+"|M15|"+signalEpoch+"|"+direction+"|HIGH_ROC_STOP_V1";
 return {symbol,direction,signalEpoch,timeframe:"M15",orderType:direction==="BUY"?"BUY_STOP":"SELL_STOP",currentPrice:latest.close,entry,stopLoss,takeProfit,roc3:r3,roc6:r6,roc12:r12,roc12Threshold:threshold,strength:Math.abs(r12)>=threshold*1.5?"VERY_HIGH":"HIGH",expiresAtEpoch:signalEpoch+3600,strategyVersion:"high-roc-stop-v1",idempotencyKey:key};
}