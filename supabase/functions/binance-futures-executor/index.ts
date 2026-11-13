import { createClient } from "npm:@supabase/supabase-js@2";
import { assertExecutionIntent, executionIdempotencyKey } from "../_shared/execution-contract.ts";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const enc=new TextEncoder();
const asArrayBuffer=(bytes:Uint8Array):ArrayBuffer=>{const copy=new Uint8Array(bytes.byteLength);copy.set(bytes);return copy.buffer;};
type PositionRow = { symbol?: string; positionAmt?: string | number };
type AssetRow = { asset?: string; availableBalance?: string | number; walletBalance?: string | number };
type IncomeRow = { income?: string | number; incomeType?: string };
type ExchangeFilter = { filterType?: string; stepSize?: string; maxQty?: string; minQty?: string; tickSize?: string; notional?: string; minNotional?: string };
type ExchangeSymbol = { symbol?: string; status?: string; filters?: ExchangeFilter[] };
type ExchangeInfo = { symbols?: ExchangeSymbol[] };
type BinanceOrderResult = { orderId?: string | number; avgPrice?: string | number; algoId?: string | number };
async function aesKey(){const s=Deno.env.get("BINANCE_CREDENTIALS_ENCRYPTION_KEY");if(!s||s.length<32)throw Error("binance_encryption_key_not_configured");const d=await crypto.subtle.digest("SHA-256",enc.encode(s));return crypto.subtle.importKey("raw",d,"AES-GCM",false,["decrypt"]);}
async function decrypt(v:string){const a=Uint8Array.from(atob(v),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:asArrayBuffer(a.slice(0,12))},await aesKey(),asArrayBuffer(a.slice(12))));}
async function sign(secret:string,q:string,keyType="hmac"){if(keyType==="ed25519"){const pem=secret.trim();if(!pem.includes("-----BEGIN PRIVATE KEY-----")||!pem.includes("-----END PRIVATE KEY-----"))throw Error("binance_ed25519_private_key_must_be_pkcs8_pem");const body=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");const der=Uint8Array.from(atob(body),c=>c.charCodeAt(0));const privateKey=await crypto.subtle.importKey("pkcs8",asArrayBuffer(der),{name:"Ed25519"},false,["sign"]);const signed=await crypto.subtle.sign("Ed25519",privateKey,enc.encode(q));return btoa(String.fromCharCode(...new Uint8Array(signed)));}if(keyType==="rsa"){const pem=secret.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");if(!pem||!secret.includes("BEGIN PRIVATE KEY"))throw Error("rsa_private_key_must_be_pkcs8_pem");const der=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));const privateKey=await crypto.subtle.importKey("pkcs8",der,{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);const signed=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",privateKey,enc.encode(q));return btoa(String.fromCharCode(...new Uint8Array(signed)));}const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const s=await crypto.subtle.sign("HMAC",k,enc.encode(q));return [...new Uint8Array(s)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function binance(key:string,secret:string,keyType:string,path:string,method="GET",params:Record<string,string>={}){const p=new URLSearchParams({...params,timestamp:String(Date.now()),recvWindow:"5000"});const sig=await sign(secret,p.toString(),keyType);let r:Response;try{r=await fetch("https://fapi.binance.com"+path+(method==="GET"?"?"+p+"&signature="+encodeURIComponent(sig):""),{method,headers:{"X-MBX-APIKEY":key,"Content-Type":"application/x-www-form-urlencoded"},...(method==="GET"?{}:{body:p.toString()+"&signature="+encodeURIComponent(sig)})});}catch{throw Error("binance_network_outcome_uncertain");}const d=await r.json();if(!r.ok)throw Error(typeof d?.msg==="string"?d.msg:"binance_request_failed");return d;}
const floorStep=(n:number,s:number)=>Math.floor(n/s+1e-10)*s;
const fmt=(n:number)=>Number(n.toPrecision(14)).toString();
async function stableClientOrderId(value:string){
 const digest=await crypto.subtle.digest("SHA-256",enc.encode(value));
 const hex=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,"0")).join("");
 return "st_"+hex.slice(0,32);
}
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
   const {data:creds,error:ce}=await db.from("binance_futures_credentials").select("encrypted_api_key,encrypted_api_secret,key_type").eq("user_id",cfg.user_id).maybeSingle();
   if(ce||!creds){failed++;continue;}
   let key:string,secret:string,keyType:string;
   try{[key,secret]=await Promise.all([decrypt(creds.encrypted_api_key),decrypt(creds.encrypted_api_secret)]);keyType=creds.key_type??"hmac";}catch{failed++;continue;}
   // Recover ambiguous submissions by the deterministic client order ID before considering new signals.
   const {data:uncertainRows,error:uncertainError}=await db.from("binance_futures_orders")
    .select("id,signal_key,symbol,side,quantity,entry_price,stop_loss,take_profit,client_order_id,status")
    .eq("user_id",cfg.user_id).eq("status","uncertain").limit(25);
   if(uncertainError){failed++;continue;}
   let haltNewOrders=false;
   for(const uncertain of uncertainRows??[]){
    try{
     if(!uncertain.client_order_id||!uncertain.symbol)continue;
     const found=await binance(key,secret,keyType,"/fapi/v1/order","GET",{symbol:String(uncertain.symbol),origClientOrderId:String(uncertain.client_order_id)});
     const exchangeStatus=String(found.status??"");
     if(exchangeStatus==="NEW"||exchangeStatus==="PARTIALLY_FILLED"){
      await binance(key,secret,keyType,"/fapi/v1/order","DELETE",{symbol:String(uncertain.symbol),origClientOrderId:String(uncertain.client_order_id)});
      const positions=await binance(key,secret,keyType,"/fapi/v3/positionRisk","GET",{symbol:String(uncertain.symbol)});
      const live=(positions??[] as PositionRow[]).find((x:PositionRow)=>x.symbol===uncertain.symbol&&Math.abs(Number(x.positionAmt))>0);
      if(live){
       const closeSide=Number(live.positionAmt)>0?"SELL":"BUY";
       await binance(key,secret,keyType,"/fapi/v1/order","POST",{symbol:String(uncertain.symbol),side:closeSide,type:"MARKET",quantity:fmt(Math.abs(Number(live.positionAmt))),reduceOnly:"true"});
      }
      await db.from("binance_futures_orders").update({status:"rejected",last_error_code:"uncertain_entry_cancelled_and_position_checked"}).eq("id",uncertain.id).eq("user_id",cfg.user_id);
      haltNewOrders=true;
      continue;
     }
     if(exchangeStatus==="FILLED"||exchangeStatus==="PARTIALLY_FILLED"){
      const positions=await binance(key,secret,keyType,"/fapi/v3/positionRisk","GET",{symbol:String(uncertain.symbol)});
      const live=(positions??[] as PositionRow[]).find((x:PositionRow)=>x.symbol===uncertain.symbol&&Math.abs(Number(x.positionAmt))>0);
      if(live){
       const closeSide=Number(live.positionAmt)>0?"SELL":"BUY";
       await binance(key,secret,keyType,"/fapi/v1/order","POST",{symbol:String(uncertain.symbol),side:closeSide,type:"MARKET",quantity:fmt(Math.abs(Number(live.positionAmt))),reduceOnly:"true"});
      }
      await db.from("binance_futures_orders").update({status:"rejected",exchange_order_id:String(found.orderId??""),result_payload:found,last_error_code:"uncertain_entry_found_position_flattened_for_safety"}).eq("id",uncertain.id).eq("user_id",cfg.user_id);
      haltNewOrders=true;
     }
    }catch(recoveryError){
     const message=recoveryError instanceof Error?recoveryError.message:"uncertain_order_recovery_failed";
     await db.from("binance_futures_orders").update({last_error_code:("recovery_pending: "+message).slice(0,120)}).eq("id",uncertain.id).eq("user_id",cfg.user_id);
     haltNewOrders=true;
    }
   }
   if(haltNewOrders)continue;
   const nowEpoch=Math.floor(Date.now()/1000);
   const freshCutoff=nowEpoch-7200;
   const {data:intents,error:ie}=await db.from("binance_futures_signal_intents").select("*").eq("user_id",cfg.user_id).eq("status","signal_ready").eq("timeframe_agreement",8).gte("signal_epoch",freshCutoff).lte("signal_epoch",nowEpoch).order("signal_epoch",{ascending:false}).limit(25);
   if(ie){failed++;continue;}
   if(!(intents??[]).length)continue;
   let memberSnapshot:{available:number;wallet:number;active:PositionRow[];exchangeSymbols:ExchangeSymbol[]}|null=null;
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
        binance(key,secret,keyType,"/fapi/v2/account"),
        binance(key,secret,keyType,"/fapi/v1/positionSide/dual"),
        binance(key,secret,keyType,"/fapi/v3/positionRisk"),
        binance(key,secret,keyType,"/fapi/v1/income","GET",{startTime:String(utcStart.getTime()),limit:"1000"})
       ]);
       if(account.canTrade!==true||mode.dualSidePosition===true)throw Error("account_not_ready_or_hedge_mode");
       const usdt=((account.assets??[]) as AssetRow[]).find((x)=>x.asset==="USDT");
       const available=Number(usdt?.availableBalance??0),wallet=Number(usdt?.walletBalance??0);
       if(!(available>0&&wallet>0))throw Error("insufficient_usdt_margin");
       const realizedAndCostsToday=Array.isArray(income)
        ?(income as IncomeRow[]).reduce((sum,row)=>{
          const type=String(row.incomeType??"");
          return ["REALIZED_PNL","COMMISSION","FUNDING_FEE"].includes(type)?sum+Number(row.income??0):sum;
         },0):0;
       const unrealizedNow=((positions??[]) as PositionRow[]).reduce((sum,row)=>sum+Number((row as PositionRow & {unRealizedProfit?:string|number}).unRealizedProfit??0),0);
       const netDailyPnl=realizedAndCostsToday+unrealizedNow;
       const dailyLossLimit=wallet*Number(cfg.max_daily_loss_pct)/100;
       if(!Number.isFinite(netDailyPnl)||!Number.isFinite(dailyLossLimit)||dailyLossLimit<=0||netDailyPnl<=-dailyLossLimit)throw Error("daily_loss_limit_reached");
       if(!exchangeInfoSnapshot){
        const response=await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo");
        if(!response.ok)throw Error("binance_exchange_info_unavailable");
        const info=await response.json() as ExchangeInfo;
        if(!Array.isArray(info?.symbols))throw Error("binance_exchange_info_invalid");
        exchangeInfoSnapshot=info.symbols;
       }
       memberSnapshot={available,wallet,active:((positions??[]) as PositionRow[]).filter((x)=>Math.abs(Number(x.positionAmt))>0),exchangeSymbols:exchangeInfoSnapshot};
      }catch(preflightError){
       memberPreflightError=preflightError instanceof Error?preflightError.message:"futures_preflight_failed";
       failed++;
       await db.from("binance_futures_signal_intents").update({payload:{...(it.payload??{}),execution_state:"blocked",execution_error:memberPreflightError.slice(0,120)}}).eq("id",it.id).eq("user_id",cfg.user_id);
       break;
      }
     }
     const {available,wallet,active,exchangeSymbols}=memberSnapshot!;
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
     const executionCreatedAt=new Date();
     assertExecutionIntent({
      schemaVersion:1,
      intentId:it.id,
      idempotencyKey:executionIdempotencyKey("binance_futures", "binance_futures:"+cfg.user_id, it.id),
      userId:cfg.user_id,
      provider:"binance_futures",
      connectionId:"binance_futures:"+cfg.user_id,
      providerAccountId:cfg.user_id,
      environment:"live",
      strategyId:"super_signal_8of8",
      strategyVersion:"super-signal-v1",
      signalId:it.signal_key,
      signalCreatedAt:new Date(Number(it.signal_epoch)*1000).toISOString(),
      expiresAt:new Date((Number(it.signal_epoch)+7200)*1000).toISOString(),
      order:{instrument:it.symbol,side:side.toLowerCase() as "buy"|"sell",kind:"market",entryPrice:entry,quantity:qty,stopLoss:sl,takeProfit:tp},
      risk:{maxLossAmount:qty*riskDistance,maxLossCurrency:"USDT",riskPercent:riskPct,maxOpenPositions:Number(cfg.max_open_positions),dailyLossLimitPercent:Number(cfg.max_daily_loss_pct),leverage:Number(cfg.leverage)},
      authorization:{liveExecutionAuthorized:cfg.live_execution_enabled===true,emergencyStop:cfg.emergency_stop===true,preflightVerifiedAt:executionCreatedAt.toISOString()},
      createdAt:executionCreatedAt.toISOString(),
     });
     const clientId=await stableClientOrderId(cfg.user_id+"|"+it.signal_key);
     const {error:ins}=await db.from("binance_futures_orders").insert({user_id:cfg.user_id,signal_key:it.signal_key,symbol:it.symbol,side,leverage:Number(cfg.leverage),quantity:qty,entry_price:entry,stop_loss:sl,take_profit:tp,risk_usdt:qty*riskDistance,client_order_id:clientId,status:"queued",request_payload:{source:"8of8_super_signal",risk_budget_usdt:riskBudget}});
     if(ins){if(ins.code==="23505"){skipped++;continue;}throw ins;}
     await binance(key,secret,keyType,"/fapi/v1/leverage","POST",{symbol:it.symbol,leverage:String(cfg.leverage)});
     let entryOrder:BinanceOrderResult;
     try{entryOrder=await binance(key,secret,keyType,"/fapi/v1/order","POST",{symbol:it.symbol,side,type:"MARKET",quantity:fmt(qty),newClientOrderId:clientId});}
     catch(e){const m=e instanceof Error?e.message:"order_submission_failed";await db.from("binance_futures_orders").update({status:m==="binance_network_outcome_uncertain"?"uncertain":"rejected",last_error_code:m.slice(0,120)}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);if(m==="binance_network_outcome_uncertain")break;throw e;}
     await db.from("binance_futures_orders").update({status:"submitted",exchange_order_id:String(entryOrder.orderId??""),result_payload:entryOrder}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);
     const opposite=side==="BUY"?"SELL":"BUY";
     try{
      const stop=await binance(key,secret,keyType,"/fapi/v1/algoOrder","POST",{algoType:"CONDITIONAL",symbol:it.symbol,side:opposite,type:"STOP_MARKET",triggerPrice:fmt(floorStep(sl,tick)),closePosition:"true",workingType:"MARK_PRICE"});
      const target=await binance(key,secret,keyType,"/fapi/v1/algoOrder","POST",{algoType:"CONDITIONAL",symbol:it.symbol,side:opposite,type:"TAKE_PROFIT_MARKET",triggerPrice:fmt(floorStep(tp,tick)),closePosition:"true",workingType:"MARK_PRICE"});
      const openAlgo=await binance(key,secret,keyType,"/fapi/v1/openAlgoOrders","GET",{symbol:it.symbol});
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
      try{await binance(key,secret,keyType,"/fapi/v1/order","POST",{symbol:it.symbol,side:opposite,type:"MARKET",quantity:fmt(qty),reduceOnly:"true"});await db.from("binance_futures_orders").update({status:"rejected",last_error_code:"protection_failed_position_flattened"}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);}
      catch{await db.from("binance_futures_orders").update({status:"uncertain",last_error_code:"CRITICAL_protection_failed_flatten_unconfirmed"}).eq("user_id",cfg.user_id).eq("signal_key",it.signal_key);}
      failed++;break;
     }
    }catch(e){failed++;const m=e instanceof Error?e.message:"futures_executor_error";await db.from("binance_futures_signal_intents").update({payload:{...(it.payload??{}),execution_state:"blocked",execution_error:m.slice(0,120)}}).eq("id",it.id).eq("user_id",cfg.user_id);if(/invalid api-key|too many requests|way too many requests|banned until|rate limit/i.test(m))break;}
   }
  }
  return reply({ok:true,submitted,skipped,failed,realOrdersOnlyWhenMemberEnabled:true});
 }catch(e){return reply({error:e instanceof Error?e.message:"executor_error"},400);}
});