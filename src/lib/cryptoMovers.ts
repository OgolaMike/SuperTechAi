export type CryptoMover={tradeDate:string;symbol:string;base:string;open:number;close:number;changePct:number;quoteVolume:number;volumeRank:number;source:string};
type BinanceTicker={symbol:string;lastPrice:string;openPrice:string;priceChangePercent:string;quoteVolume:string};
type OkxTicker={instId:string;last:string;open24h:string;volCcy24h:string};
type BybitTicker={symbol:string;lastPrice:string;prevPrice24h:string;price24hPcnt:string;turnover24h:string};
let cache:{value:CryptoMover[];expiresAt:number}|null=null;
let pending:Promise<CryptoMover[]>|null=null;

async function proxyJson<T>(url:string):Promise<T>{
 const response=await fetch(`/api/market-proxy?url=${encodeURIComponent(url)}`,{headers:{accept:'application/json'},cache:'no-store'});
 if(!response.ok)throw new Error(`Market provider returned HTTP ${response.status}`);
 return await response.json() as T;
}
function rank(rows:CryptoMover[]):CryptoMover[]{
 const valid=rows.filter(row=>row.close>0&&row.open>0&&row.quoteVolume>0&&Number.isFinite(row.changePct));
 if(valid.length<10)throw new Error('Market provider returned too few valid USDT markets');
 const sorted=valid.sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,200);
 sorted.forEach((row,index)=>{row.volumeRank=index+1});
 return sorted;
}
async function loadOkx():Promise<CryptoMover[]>{
 const response=await proxyJson<{code:string;data:OkxTicker[]}>('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
 if(response.code!=='0'||!Array.isArray(response.data))throw new Error('OKX returned an invalid spot-market response');
 return rank(response.data.filter(row=>row.instId.endsWith('-USDT')).map(row=>{
  const close=Number(row.last),open=Number(row.open24h);
  return {tradeDate:new Date().toISOString().slice(0,10),symbol:row.instId.replace('-',''),base:row.instId.slice(0,-5),open,close,changePct:open>0?(close-open)/open*100:0,quoteVolume:Number(row.volCcy24h),volumeRank:0,source:'OKX'};
 }));
}
async function loadBybit():Promise<CryptoMover[]>{
 const response=await proxyJson<{retCode:number;result:{list:BybitTicker[]}}>('https://api.bybit.com/v5/market/tickers?category=spot');
 if(response.retCode!==0||!Array.isArray(response.result?.list))throw new Error('Bybit returned an invalid spot-market response');
 return rank(response.result.list.filter(row=>row.symbol.endsWith('USDT')).map(row=>{
  const close=Number(row.lastPrice),open=Number(row.prevPrice24h);
  return {tradeDate:new Date().toISOString().slice(0,10),symbol:row.symbol,base:row.symbol.slice(0,-4),open,close,changePct:open>0?(close-open)/open*100:Number(row.price24hPcnt)*100,quoteVolume:Number(row.turnover24h),volumeRank:0,source:'Bybit'};
 }));
}
async function loadBinance():Promise<CryptoMover[]>{
 const hosts=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com'];
 let lastError:unknown=null;
 for(const host of hosts){
  try{
   const data=await proxyJson<BinanceTicker[]>(`${host}/api/v3/ticker/24hr`);
   if(!Array.isArray(data))throw new Error('Binance returned an unexpected market-data response');
   return rank(data.filter(row=>row.symbol.endsWith('USDT')).map(row=>{
    const close=Number(row.lastPrice),open=Number(row.openPrice);
    return {tradeDate:new Date().toISOString().slice(0,10),symbol:row.symbol,base:row.symbol.slice(0,-4),open,close,changePct:open>0?(close-open)/open*100:Number(row.priceChangePercent),quoteVolume:Number(row.quoteVolume),volumeRank:0,source:'Binance'};
   }));
  }catch(error){lastError=error}
 }
 throw lastError instanceof Error?lastError:new Error('Binance market data unavailable');
}
async function loadMovers():Promise<CryptoMover[]>{
 const providers=[['OKX',loadOkx],['Bybit',loadBybit],['Binance',loadBinance]] as const;
 const failures:string[]=[];
 for(const [name,load] of providers){
  try{return await load()}catch(error){failures.push(`${name}: ${error instanceof Error?error.message:'unavailable'}`)}
 }
 throw new Error(`All crypto market-data providers failed. ${failures.join(' | ')}`);
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
