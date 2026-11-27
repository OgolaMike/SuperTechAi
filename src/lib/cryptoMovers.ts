export type CryptoMover={tradeDate:string;symbol:string;base:string;open:number;close:number;changePct:number;quoteVolume:number;volumeRank:number};
type NormalizedTicker={symbol:string;open:number;close:number;changePct:number;quoteVolume:number};
let cache:{value:CryptoMover[];expiresAt:number}|null=null;
let pending:Promise<CryptoMover[]>|null=null;

const EXCLUDED_BASES=new Set(["USDC","USDT","BUSD","TUSD","FDUSD","DAI","USDP","EUR","GBP","AEUR","PAXG"]);
const LEVERAGED_SUFFIX=/(UP|DOWN|BULL|BEAR)$/;
const proxyGet=async<T>(url:string):Promise<T>=>{
 const response=await fetch(`/api/market-proxy?url=${encodeURIComponent(url)}`,{headers:{accept:"application/json"},cache:"no-store"});
 if(!response.ok)throw new Error(`HTTP ${response.status}`);
 return response.json() as Promise<T>;
};
function validTicker(symbol:string,open:number,close:number,changePct:number,quoteVolume:number):NormalizedTicker|null{
 if(!symbol.endsWith("USDT"))return null;
 const base=symbol.slice(0,-4);
 if(base.length<2||EXCLUDED_BASES.has(base)||LEVERAGED_SUFFIX.test(base))return null;
 if(!(open>0)||!(close>0)||!Number.isFinite(changePct)||!(quoteVolume>0))return null;
 return {symbol,open,close,changePct,quoteVolume};
}
async function binance():Promise<NormalizedTicker[]>{
 const hosts=["https://data-api.binance.vision","https://api.binance.com","https://api1.binance.com","https://api2.binance.com","https://api3.binance.com"];
 let lastError:unknown;
 for(const host of hosts){
  try{
   const data=await proxyGet<Array<{symbol:string;openPrice:string;lastPrice:string;priceChangePercent:string;quoteVolume:string}>>(`${host}/api/v3/ticker/24hr`);
   if(!Array.isArray(data))throw new Error("Invalid Binance response");
   const rows=data.map(x=>validTicker(x.symbol,Number(x.openPrice),Number(x.lastPrice),Number(x.priceChangePercent),Number(x.quoteVolume))).filter((x):x is NormalizedTicker=>x!==null);
   if(rows.length>=10)return rows;
   throw new Error("Too few valid Binance markets");
  }catch(error){lastError=error}
 }
 throw lastError instanceof Error?lastError:new Error("Binance unavailable");
}
async function bybit():Promise<NormalizedTicker[]>{
 const data=await proxyGet<{retCode:number;result?:{list?:Array<{symbol:string;prevPrice24h:string;lastPrice:string;price24hPcnt:string;turnover24h:string}>}}>("https://api.bybit.com/v5/market/tickers?category=spot");
 if(data.retCode!==0||!Array.isArray(data.result?.list))throw new Error("Invalid Bybit response");
 return data.result.list.map(x=>validTicker(x.symbol,Number(x.prevPrice24h),Number(x.lastPrice),Number(x.price24hPcnt)*100,Number(x.turnover24h))).filter((x):x is NormalizedTicker=>x!==null);
}
async function okx():Promise<NormalizedTicker[]>{
 const data=await proxyGet<{code:string;data?:Array<{instId:string;open24h:string;last:string;sodUtc0?:string;volCcy24h:string;vol24h:string}>}>("https://www.okx.com/api/v5/market/tickers?instType=SPOT");
 if(data.code!=="0"||!Array.isArray(data.data))throw new Error("Invalid OKX response");
 return data.data.map(x=>{
  const symbol=x.instId.replace("-","");
  const open=Number(x.open24h),close=Number(x.last);
  const quoteVolume=Number(x.volCcy24h)||Number(x.vol24h)*close;
  return validTicker(symbol,open,close,open>0?((close-open)/open)*100:NaN,quoteVolume);
 }).filter((x):x is NormalizedTicker=>x!==null);
}
async function loadMovers():Promise<CryptoMover[]>{
 const providers=[["Binance",binance],["Bybit",bybit],["OKX",okx]] as const;
 const failures:string[]=[];
 for(const [name,load] of providers){
  try{
   const data=await load();
   const rows=data.sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,200).map((row,index)=>({
    tradeDate:new Date().toISOString().slice(0,10),...row,base:row.symbol.slice(0,-4),volumeRank:index+1,
   }));
   if(rows.length<10)throw new Error("Fewer than 10 valid USDT markets");
   return rows;
  }catch(error){failures.push(`${name}: ${error instanceof Error?error.message:"unavailable"}`)}
 }
 throw new Error(`All public crypto market providers are unavailable. ${failures.join("; ")}`);
}
export function formatUsd(value:number):string{const digits=value>=1000?2:value>=1?4:6;return `$${value.toLocaleString("en-US",{minimumFractionDigits:digits,maximumFractionDigits:digits})}`}
export function formatCompactUsd(value:number):string{return `$${new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:2}).format(value)}`}
export function formatChange(value:number):string{return `${value>=0?"+":""}${value.toFixed(2)}%`}
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
