import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const enc=new TextEncoder();
type PositionRow = { symbol?: string; positionAmt?: string | number };
type AssetRow = { asset?: string; availableBalance?: string | number; walletBalance?: string | number };
type IncomeRow = { income?: string | number };
type ExchangeFilter = { filterType?: string; stepSize?: string; maxQty?: string; minQty?: string; tickSize?: string; notional?: string; minNotional?: string };
type ExchangeSymbol = { symbol?: string; status?: string; filters?: ExchangeFilter[] };
type ExchangeInfo = { symbols?: ExchangeSymbol[] };
type BinanceOrderResult = { orderId?: string | number; avgPrice?: string | number; algoId?: string | number };
async function aesKey(){const s=Deno.env.get("BINANCE_CREDENTIALS_ENCRYPTION_KEY");if(!s||s.length<32)throw Error("binance_encryption_key_not_configured");const d=await crypto.subtle.digest("SHA-256",enc.encode(s));return crypto.subtle.importKey("raw",d,"AES-GCM",false,["decrypt"]);}
async function decrypt(v:string){const a=Uint8Array.from(atob(v),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:a.slice(0,12)},await aesKey(),a.slice(12)));}
async function sign(secret:string,q:string){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const s=await crypto.subtle.sign("HMAC",k,enc.encode(q));return [...new Uint8Array(s)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function binance(key:string,secret:string,path:string,method="GET",params:Record<string,string>={}){const p=new URLSearchParams({...params,timestamp:String(Date.now()),recvWindow:"5000"});const sig=await sign(secret,p.toString());let r:Response;try{r=await fetch("https://fapi.binance.com"+path+(method==="GET"?"?"+p+"&signature="+sig:""),{method,headers:{"X-MBX-APIKEY":key,"Content-Type":"application/x-www-form-urlencoded"},...(method==="GET"?{}:{body:p.toString()+"&signature="+sig})});}catch{throw Error("binance_network_outcome_uncertain");}const d=await r.json();if(!r.ok)throw Error(typeof d?.msg==="string"?d.msg:"binance_request_failed");return d;}
const floorStep=(n:number,s:number)=>Math.floor(n/s+1e-10)*s;
const fmt=(n:number)=>Number(n.toPrecision(14)).toString();
let exchangeInfoSnapshot:ExchangeSymbol[]|null=null;
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 try{
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  const auth=req.headers.get("authorization")??"";
  if(!service||auth!=="Bearer "+service)return reply({error:"internal_authorization_required"},401);
  const url=Deno.env.get("SUPABASE_URL")!;
  const db=createClient(url,service,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({}));
  if(body.action!=="execute_pending")return reply({error:"unsupported_action"},400);
  const {data:settings,error:se}=await db.from("binance_futures_settings").select("*").eq("connection_status","connected").eq("auto_trade_enabled",true).eq("live_execution_enabled",true).eq("emergency_stop",false).limit(100);
  if(se)throw se;
  let submitted=0,skipped=0,failed=0;
  for(const cfg of settings??[]){
   const {data:creds,error:ce}=await db.from("binance_futures_credentials").select("encrypted_api_key,encrypted_api_secret").eq("user_id",cfg.user_id).maybeSingle();
   if(ce||!creds){failed++;continue;}
   let key:string,secret:string;
   try{[key,secret]=await Promise.all([decrypt(creds.encrypted_api_key),decrypt(creds.encrypted_api_secret)]);}catch{failed++;continue;}
   const nowEpoch=Math.floor(Date.now()/1000);
   const freshCutoff=nowEpoch-7200;
   const {data:intents,error:ie}=await db.from("binance_futures_signal_intents").select("*").eq("user_id",cfg.user_id).eq("status","signal_ready").eq("timeframe_agreement",8).gte("signal_epoch",freshCutoff).lte("signal_epoch",nowEpoch).order("signal_epoch",{ascending:false}).limit(25);
   if(ie){failed++;continue;}
   if(!(intents??[]).length)continue;
   let memberSnapshot:{account:any;available:number;wallet:number;active:PositionRow[];exchangeSymbols:ExchangeSymbol[]}|null=null;
   let memberPreflightError:string|null=null;
   for(const it of intents??[]){
    const now=Math.floor(Date.now()/1000);
    if((Array.isArray(cfg.allowed_symbols)&&cfg.allowed_symbols.length>0&&!cfg.allowed_symbols.includes(it.symbol))||Number(it.timeframe_agreement)!==8||now-Number(it.signal_epoch)>7200||now<Number(it.signal_epoch)||!Number(it.entry_price)||!Number(it.stop_loss)||!Number(it.take_profit)){skipped++;continue;}
    const {data:dup}=await db.from("binance_futures_orders").select("id,status").eq("user_id",cfg.user_id).eq("signal_key",it.signal_key).maybeSingle();
    if(dup){skipped++;continue;}
    try{
     if(memberPreflightError){skipped++;continue;}
     if(!memberSnapshot){
      try{
       const utcStart=new Date();utcStart.setUTCHours(0,0,0,0);
       const [account,mode,positions,income]=await Promise.all([
        binance(key,secret,"/fapi/v2/account"),
        binance(key,secret,"/fapi/v1/positionSide/dual"),
        binance(key,secret,"/fapi/v3/positionRisk"),
        binance(key,secret,"/fapi/v1/income","GET",{incomeType:"REALIZED_PNL",startTime:String(utcStart.getTime()),limit:"1000"})
       ]);
       if(account.canTrade!==true||mode.dualSidePosition===true)throw Error("account_not_ready_or_hedge_mode");
       const usdt=((account.assets??[]) as AssetRow[]).find((x)=>x.asset==="USDT");
       const available=Number(usdt?.availableBalance??0),wallet=Number(usdt?.walletBalance??0);
       if(!(available>0&&wallet>0))throw Error("insufficient_usdt_margin");
       const realizedToday=Array.isArray(income)?(income as IncomeRow[]).reduce((sum,row)=>sum+Number(row.income??0),0):0;
       const dailyLossLimit=wallet*Number(cfg.max_daily_loss_pct)/100;
       if(!Number.isFinite(realizedToday)||realizedToday<=-dailyLossLimit)throw Error("daily_loss_limit_reached");
       if(!exchangeInfoSnapshot){
        const response=await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
        if(!response.ok)throw Error("binance_exchange_info_unavailable");
        const info=await response.json() as ExchangeInfo;
        if(!Array.isArray(info?.symbols))throw Error("binance_exchange_info_invalid");
        exchangeInfoSnapshot=info.symbols;
       }
       memberSnapshot={account,available,wallet,active:((positions??[]) as PositionRow[]).filter((x)=>Math.abs(Number(x.positionAmt))>0),exchangeSymbols:exchangeInfoSnapshot};
      }catch(preflightError){
       memberPreflightError=preflightError instanceof Error?preflightError.message:"futures_preflight_failed";
       failed++;
       await db.from("binance_futures_signal_intents").update({payload:{...(it.payload??{}),execution_state:"blocked",execution_error:memberPreflightError.slice(0,120)}}).eq("id",it.id).eq("user_id",cfg.user_id);
       break;
      }
     }
     const {account,available,wallet,active,exchangeSymbols}=memberSnapshot;
     if(active.length>=Number(cfg.max_open_positions)){skipped++;break;}
     if(active.some((x)=>x.symbol===it.symbol)){skipped++;continue;}
     const symbolInfo=exchangeSymbols.find((x)=>x.symbol===it.symbol&&x.status==="TRADING");
     if(!symbolInfo)throw Error("symbol_not_trading");
     const filters=symbolInfo.filters??[];
     const lot=filters.find((x)=>x.filterType==="LOT_SIZE");
     const priceFilter=filters.find((x)=>x.filterType==="PRICE_FILTER");
     const notionalFilter=filters.find((x)=>x.filterType==="MIN_NOTIONAL"||x.filterType==="NOTIONAL");
     if(!lot||!priceFilter)throw Error("symbol_filters_missing");
     const tick=Number(priceFilter.tickSize),step=Number(lot.stepSize),minQty=Number(lot.minQty),minNotional=Number(notionalFilter?.notional??notionalFilter?.minNotional??5);
     const side=it.side==="BUY"?"BUY":it.side==="SELL"?"SELL":null;
     if(!side)throw Error("invalid_signal_side");
     const entry=Number(it.entry_price),sl=Number(it.stop_loss),tp=Number(it.take_profit);
     if((side==="BUY"&&!(sl<entry&&tp>entry))||(side==="SELL"&&!(tp<entry&&sl>entry)))throw Error("invalid_signal_protection_levels");
     const riskPct=Number(cfg.risk_percent);
     if(!(riskPct>0&&riskPct<=2))throw Error("invalid_risk_percent");
     const riskBudget=wallet*riskPct/100;
     const riskDistance=Math.abs(entry-sl);
     const rawQty=riskBudget/riskDistance;
     const maxAffordable=(available*Number(cfg.leverage)*0.95)/entry;
     const qty=floorStep(Math.min(rawQty,maxAffordable,Number(lot.maxQty)),step);
     if(qty<minQty||qty*entry<minNotional)throw Error("order_below_exchange_minimum");
     const clientId="stai_"+(await sign(secret,cfg.user_id+"|"+it.signal_key)).slice(0,28);
     const {error:ins}=await db.from("binance_futures_orders").insert({user_id:cfg.user_id,signal_key:it.signal_key,symbol:it.symbol,side,leverage:Number(cfg.leverage),quantity:qty,entry_price:entry,stop_loss:sl,take_profit:tp,risk_usdt:qty*riskDistance,client_order_id:clientId,status:"queued",request_payload:{source:"8of8_super_signal",risk_budget_usdt:riskBudget}});
     if(ins){if(ins.code==="23505"){skipped++;continue;}throw ins;}
     await binance(key,secret,"/fapi/v1/leverage","POST",{symbol:it.symbol,leverage:String(cfg.leverage)});
     let entryOrder:BinanceOrderResult;
     try{entryOrder=await binance(key,secret,"/fapi/v1/order","POST",{symbol:it.symbol,side,type:"MARKET",quantity:fmt(qty),newClientOrderId:clientId});}
     catch(e){const m=e instanceof Error?e.message:"order_submission_failed";await db.from("binance_futures_orders").update({status:m==="binance_network_outcome_uncertain"?"uncertain":"rejected",last_error_code:m.slice(0,120)}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);if(m==="binance_network_outcome_uncertain")break;throw e;}
     await db.from("binance_futures_orders").update({status:"submitted",exchange_order_id:String(entryOrder.orderId??""),result_payload:entryOrder}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);
     const opposite=side==="BUY"?"SELL":"BUY";
     try{
      const stop=await binance(key,secret,"/fapi/v1/algoOrder","POST",{algoType:"CONDITIONAL",symbol:it.symbol,side:opposite,type:"STOP_MARKET",triggerPrice:fmt(floorStep(sl,tick)),closePosition:"true",workingType:"MARK_PRICE"});
      const target=await binance(key,secret,"/fapi/v1/algoOrder","POST",{algoType:"CONDITIONAL",symbol:it.symbol,side:opposite,type:"TAKE_PROFIT_MARKET",triggerPrice:fmt(floorStep(tp,tick)),closePosition:"true",workingType:"MARK_PRICE"});
      const openAlgo=await binance(key,secret,"/fapi/v1/openAlgoOrders","GET",{symbol:it.symbol});
      const algos: BinanceOrderResult[]=Array.isArray(openAlgo)?openAlgo as BinanceOrderResult[]:Array.isArray(openAlgo.orders)?openAlgo.orders as BinanceOrderResult[]:[];
      const protectedOk=algos.some((x)=>String(x.algoId)===String(stop.algoId))&&algos.some((x)=>String(x.algoId)===String(target.algoId));
      if(!protectedOk)throw Error("protective_orders_not_confirmed");
      await db.from("binance_futures_orders").update({status:"protected",stop_order_id:String(stop.algoId),take_profit_order_id:String(target.algoId),result_payload:{entry:entryOrder,stop,target,verified:true}}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);
      await db.from("binance_futures_positions").insert({user_id:cfg.user_id,symbol:it.symbol,side:side==="BUY"?"LONG":"SHORT",quantity:qty,entry_price:Number(entryOrder.avgPrice||entry),mark_price:Number(entryOrder.avgPrice||entry),leverage:Number(cfg.leverage),unrealized_pnl:0,stop_loss:sl,take_profit:tp,source_signal_key:it.signal_key,status:"open",opened_at:new Date().toISOString(),updated_at:new Date().toISOString()});
      memberSnapshot.active.push({symbol:it.symbol,positionAmt:side==="BUY"?qty:-qty});
      await db.from("binance_futures_signal_intents").update({status:"dismissed",payload:{...(it.payload??{}),execution_state:"protected_order_live"}}).eq("id",it.id).eq("user_id",cfg.user_id);
      submitted++;
     }catch{
      // Immediately attempt to flatten any entry that could not be protected.
      try{await binance(key,secret,"/fapi/v1/order","POST",{symbol:it.symbol,side:opposite,type:"MARKET",quantity:fmt(qty),reduceOnly:"true"});await db.from("binance_futures_orders").update({status:"rejected",last_error_code:"protection_failed_position_flattened"}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);}
      catch{await db.from("binance_futures_orders").update({status:"uncertain",last_error_code:"CRITICAL_protection_failed_flatten_unconfirmed"}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);}
      failed++;break;
     }
    }catch(e){failed++;const m=e instanceof Error?e.message:"futures_executor_error";await db.from("binance_futures_signal_intents").update({payload:{...(it.payload??{}),execution_state:"blocked",execution_error:m.slice(0,120)}}).eq("id",it.id).eq("user_id",cfg.user_id);if(/invalid api-key|too many requests|way too many requests|banned until|rate limit/i.test(m))break;}
   }
  }
  return reply({ok:true,submitted,skipped,failed,realOrdersOnlyWhenMemberEnabled:true});
 }catch(e){return reply({error:e instanceof Error?e.message:"executor_error"},400);}
});