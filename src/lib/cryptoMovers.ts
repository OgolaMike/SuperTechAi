export type CryptoMover={tradeDate:string;symbol:string;base:string;open:number;close:number;changePct:number;quoteVolume:number;volumeRank:number;source:string};
type Row=Record<string,unknown>;
const MARKET_PROXY='https://supertechai-market-data.mikedavid45.workers.dev/api/market-proxy';
let cache:{value:CryptoMover[];expiresAt:number}|null=null;
let pending:Promise<CryptoMover[]>|null=null;
const n=(value:unknown)=>Number(value);
const s=(value:unknown)=>typeof value==='string'?value:String(value??'');
const valid=(value:number)=>Number.isFinite(value)&&value>0;

async function proxyJson<T>(url:string):Promise<T>{
 const response=await fetch(`${MARKET_PROXY}?url=${encodeURIComponent(url)}`,{headers:{accept:'application/json'},cache:'no-store'});
 if(!response.ok)throw new Error(`Market provider returned HTTP ${response.status}`);
 return await response.json() as T;
}
function rank(rows:CryptoMover[],source:string):CryptoMover[]{
 const validRows=rows.filter(row=>valid(row.close)&&valid(row.open)&&valid(row.quoteVolume)&&Number.isFinite(row.changePct));
 if(validRows.length<10)throw new Error('Provider returned too few valid USDT spot markets');
 const sorted=validRows.sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,200);
 sorted.forEach((row,index)=>{row.volumeRank=index+1;row.source=source});
 return sorted;
}
const today=()=>new Date().toISOString().slice(0,10);
function make(symbol:string,base:string,open:number,close:number,quoteVolume:number,changePct?:number):CryptoMover{
 return {tradeDate:today(),symbol,base,open,close,quoteVolume,changePct:changePct??(open>0?(close/open-1)*100:0),volumeRank:0,source:''};
}
async function loadKucoin():Promise<CryptoMover[]>{
 const d=await proxyJson<{data?:{ticker?:Row[]}}>('https://api.kucoin.com/api/v1/market/allTickers');
 return rank((d.data?.ticker??[]).flatMap(x=>{const [base,quote]=s(x.symbol).split('-');const close=n(x.last),rate=n(x.changeRate),open=close/(1+rate);return quote==='USDT'?[make(`${base}USDT`,base,open,close,n(x.volValue))]:[]}), 'KuCoin');
}
async function loadGate():Promise<CryptoMover[]>{
 const d=await proxyJson<Row[]>('https://api.gateio.ws/api/v4/spot/tickers');
 return rank((Array.isArray(d)?d:[]).flatMap(x=>{const [base,quote]=s(x.currency_pair).split('_');const close=n(x.last),change=n(x.change_percentage),open=close/(1+change/100);return quote==='USDT'?[make(`${base}USDT`,base,open,close,n(x.quote_volume),change)]:[]}), 'Gate.io');
}
async function loadBitget():Promise<CryptoMover[]>{
 const d=await proxyJson<{data?:Row[]}>('https://api.bitget.com/api/v2/spot/market/tickers');
 return rank((d.data??[]).flatMap(x=>{const symbol=s(x.symbol);if(!symbol.endsWith('USDT'))return[];const base=symbol.slice(0,-4);return[make(symbol,base,n(x.open),n(x.lastPr),n(x.usdtVolume))]}),'Bitget');
}
async function loadMexc():Promise<CryptoMover[]>{
 const d=await proxyJson<Row[]>('https://api.mexc.com/api/v3/ticker/24hr');
 return rank((Array.isArray(d)?d:[]).filter(x=>s(x.symbol).endsWith('USDT')).map(x=>{const symbol=s(x.symbol),base=symbol.slice(0,-4);return make(symbol,base,n(x.openPrice),n(x.lastPrice),n(x.quoteVolume),n(x.priceChangePercent))}),'MEXC');
}
async function loadCoinEx():Promise<CryptoMover[]>{
 const d=await proxyJson<{data?:Row[]}>('https://api.coinex.com/v2/spot/ticker');
 return rank((d.data??[]).flatMap(x=>{const symbol=s(x.market);if(!symbol.endsWith('USDT'))return[];const base=symbol.slice(0,-4);return[make(symbol,base,n(x.open),n(x.last),n(x.value))]}),'CoinEx');
}
async function loadBitmart():Promise<CryptoMover[]>{
 const d=await proxyJson<{data?:unknown[][]}>('https://api-cloud.bitmart.com/spot/quotation/v3/tickers');
 return rank((d.data??[]).flatMap(x=>{const [base,quote]=s(x[0]).split('_');return quote==='USDT'?[make(`${base}USDT`,base,n(x[2]),n(x[1]),n(x[6]))]:[]}), 'BitMart');
}
async function loadBingx():Promise<CryptoMover[]>{
 const d=await proxyJson<{data?:{tickers?:Row[]}}>('https://open-api.bingx.com/openApi/spot/v1/ticker/24hr');
 return rank((d.data?.tickers??[]).flatMap(x=>{const symbol=s(x.symbol),base=symbol.endsWith('-USDT')?symbol.slice(0,-5):'';return base?[make(`${base}USDT`,base,n(x.openPrice),n(x.lastPrice),n(x.quoteVolume),n(x.priceChangePercent))]:[]}), 'BingX');
}
async function loadOkx():Promise<CryptoMover[]>{
 const d=await proxyJson<{code:string;data?:Row[]}>('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
 if(d.code!=='0')throw new Error('OKX returned an invalid spot-market response');
 return rank((d.data??[]).flatMap(x=>{const symbol=s(x.instId);if(!symbol.endsWith('-USDT'))return[];const base=symbol.slice(0,-5);return[make(`${base}USDT`,base,n(x.open24h),n(x.last),n(x.volCcy24h)*n(x.last))]}),'OKX');
}
async function loadBybit():Promise<CryptoMover[]>{
 const d=await proxyJson<{retCode:number;result?:{list?:Row[]}}>('https://api.bybit.com/v5/market/tickers?category=spot');
 if(d.retCode!==0)throw new Error('Bybit returned an invalid spot-market response');
 return rank((d.result?.list??[]).flatMap(x=>{const symbol=s(x.symbol);if(!symbol.endsWith('USDT'))return[];const base=symbol.slice(0,-4);return[make(symbol,base,n(x.prevPrice24h),n(x.lastPrice),n(x.turnover24h),n(x.price24hPcnt)*100)]}),'Bybit');
}
async function loadBinance():Promise<CryptoMover[]>{
 const hosts=['https://data-api.binance.vision','https://api.binance.com','https://api1.binance.com'];
 let last:unknown=null;
 for(const host of hosts){try{const d=await proxyJson<Row[]>(`${host}/api/v3/ticker/24hr`);if(!Array.isArray(d))throw new Error('Invalid Binance response');return rank(d.filter(x=>s(x.symbol).endsWith('USDT')).map(x=>{const symbol=s(x.symbol),base=symbol.slice(0,-4);return make(symbol,base,n(x.openPrice),n(x.lastPrice),n(x.quoteVolume),n(x.priceChangePercent))}),'Binance')}catch(error){last=error}}
 throw last instanceof Error?last:new Error('Binance market data unavailable');
}
async function loadMovers():Promise<CryptoMover[]>{
 const providers=[loadKucoin,loadGate,loadBitget,loadMexc,loadCoinEx,loadBitmart,loadBingx,loadOkx,loadBybit,loadBinance];
 const failures:string[]=[];
 for(const load of providers){try{return await load()}catch(error){failures.push(error instanceof Error?error.message:'unavailable')}}
 throw new Error(`All market-data providers failed. ${failures.join(' | ')}`);
}
export function formatUsd(value:number):string{const digits=value>=1000?2:value>=1?4:6;return `$${value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits})}`}
export function formatCompactUsd(value:number):string{return `$${new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2}).format(value)}`}
export function formatChange(value:number):string{return `${value>=0?'+':''}${value.toFixed(2)}%`}
export async function fetchCryptoMovers(forceRefresh=false):Promise<CryptoMover[]>{
 if(!forceRefresh&&cache&&cache.expiresAt>Date.now())return cache.value;
 if(pending)return pending;
 pending=loadMovers().then(value=>{cache={value,expiresAt:Date.now()+15000};return value}).finally(()=>{pending=null});
 return pending;
}
export async function fetchCurrentDayCryptoMovers(forceRefresh=false):Promise<{movers:CryptoMover[];updatedAt:string}>{
 const movers=await fetchCryptoMovers(forceRefresh);
 return {movers,updatedAt:new Date().toISOString()};
}
