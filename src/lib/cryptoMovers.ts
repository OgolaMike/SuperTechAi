export type CryptoMover={tradeDate:string;symbol:string;base:string;open:number;close:number;changePct:number;quoteVolume:number;volumeRank:number};
type BinanceTicker={symbol:string;priceChangePercent:string;lastPrice:string;openPrice:string;quoteVolume:string};
let cache:{value:CryptoMover[];expiresAt:number}|null=null;
let pending:Promise<CryptoMover[]>|null=null;
async function loadMovers():Promise<CryptoMover[]>{
 const response=await fetch(`/api/market-proxy?url=${encodeURIComponent('https://api.binance.com/api/v3/ticker/24hr')}`);
 if(!response.ok)throw new Error('Binance public market feed is unavailable');
 const data=await response.json() as BinanceTicker[];
 const rows=data.filter(row=>row.symbol.endsWith('USDT')&&Number.isFinite(Number(row.lastPrice))&&Number.isFinite(Number(row.priceChangePercent)))
  .map(row=>({tradeDate:new Date().toISOString().slice(0,10),symbol:row.symbol,base:row.symbol.slice(0,-4),open:Number(row.openPrice),close:Number(row.lastPrice),changePct:Number(row.priceChangePercent),quoteVolume:Number(row.quoteVolume),volumeRank:0}))
  .filter(row=>row.close>0&&row.quoteVolume>0).sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,200);
 rows.forEach((row,index)=>{row.volumeRank=index+1});
 if(rows.length<10)throw new Error('Binance returned too few valid USDT markets');
 return rows;
}
export function formatUsd(value:number):string{const digits=value>=1000?2:value>=1?4:6;return `$${value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits})}`}
export function formatCompactUsd(value:number):string{return `$${new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(value)}`}
export function formatChange(value:number):string{return `${value>=0?'+':''}${value.toFixed(2)}%`}
export async function fetchCryptoMovers(forceRefresh=false):Promise<CryptoMover[]>{
 if(!forceRefresh&&cache&&cache.expiresAt>Date.now())return cache.value;
 if(pending)return pending;
 pending=loadMovers().then(value=>{cache={value,expiresAt:Date.now()+30000};return value}).finally(()=>{pending=null});
 return pending;
}
export async function fetchCurrentDayCryptoMovers(forceRefresh=false):Promise<{movers:CryptoMover[];updatedAt:string}>{
 const movers=await fetchCryptoMovers(forceRefresh);
 return {movers,updatedAt:new Date().toISOString()};
}
