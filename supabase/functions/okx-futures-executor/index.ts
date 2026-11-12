import { createClient } from "npm:@supabase/supabase-js@2";
import { assertExecutionIntent, executionIdempotencyKey } from "../_shared/execution-contract.ts";

type OkxRecord = Record<string, unknown>;
type OkxExecutionResult = {
 executed?: boolean;
 failed?: boolean;
 user_id?: string;
 inst_id?: string;
 demo?: boolean;
 order_id?: string;
 algo_id?: string;
 id?: string;
 error?: string;
};
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const out=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const enc=new TextEncoder(),url=Deno.env.get("SUPABASE_URL")!,service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(url,service,{auth:{persistSession:false}});
async function dec(v:string){const master=Deno.env.get("BINANCE_CREDENTIALS_ENCRYPTION_KEY");if(!master||master.length<32)throw Error("exchange_encryption_key_missing");const digest=await crypto.subtle.digest("SHA-256",enc.encode(master)),key=await crypto.subtle.importKey("raw",digest,"AES-GCM",false,["decrypt"]),a=Uint8Array.from(atob(v),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:a.slice(0,12)},key,a.slice(12)));}
async function sign(secret:string,msg:string){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC",key,enc.encode(msg)))));}
async function api(k:string,s:string,p:string,path:string,method="GET",body:Record<string,unknown>|null=null,demo=false){const ts=new Date().toISOString(),raw=body?JSON.stringify(body):"",sig=await sign(s,ts+method+path+raw),r=await fetch("https://openapi.okx.com"+path,{method,headers:{"OK-ACCESS-KEY":k,"OK-ACCESS-SIGN":sig,"OK-ACCESS-TIMESTAMP":ts,"OK-ACCESS-PASSPHRASE":p,"Content-Type":"application/json",...(demo?{"x-simulated-trading":"1"}:{})},...(body?{body:raw}:{})}),d=await r.json();if(!r.ok||d.code!=="0")throw Error("OKX "+(d.code??r.status)+": "+(d.msg??"request failed"));const bad=(d.data??[]).find((x:OkxRecord)=>typeof x.sCode==="string"&&x.sCode!=="0");if(bad)throw Error("OKX "+String(bad.sCode)+": "+String(bad.sMsg??"request failed"));return d.data??[];}
async function stableClientId(value:string){const digest=await crypto.subtle.digest("SHA-256",enc.encode(value));return "st"+[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,30);}
const stepFloor=(n:number,step:number)=>Math.floor((n+1e-10)/step)*step;
Deno.serve(async req=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return out({error:"method_not_allowed"},405);try{
 const token=(req.headers.get("Authorization")??"").replace(/^Bearer\s+/i,"");if(!service||token!==service)return out({error:"service_authorization_required"},403);
 const body=await req.json();if(body.action!=="execute_pending")return out({error:"unsupported_action"},400);
 const {data:rows,error}=await db.from("okx_futures_signal_intents").select("*").eq("status","signal_ready").order("created_at",{ascending:true}).limit(100);if(error)throw error;
 const results:OkxExecutionResult[]=[];
 for(const row of rows??[]){try{
  const {data:claimed,error:claimError}=await db.from("okx_futures_signal_intents").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","signal_ready").select("id");if(claimError)throw claimError;if(!claimed?.length)continue;
  const {data:st,error:stErr}=await db.from("okx_futures_settings").select("*").eq("user_id",row.user_id).maybeSingle();if(stErr||!st||st.connection_status!=="connected"||!st.auto_trade_enabled||st.emergency_stop)throw Error("okx_automation_not_enabled");
  if(st.demo_trading!==true&&st.live_execution_enabled!==true)throw Error("okx_live_execution_not_authorized");
  if(Number(row.timeframe_agreement)!==8||Date.now()/1000-Number(row.signal_epoch)>7200||Date.now()/1000<Number(row.signal_epoch))throw Error("signal_not_fresh_8_of_8");
  const {data:c,error:ce}=await db.from("okx_futures_credentials").select("*").eq("user_id",row.user_id).single();if(ce||!c)throw Error("okx_credentials_missing");
  const [k,s,p]=await Promise.all([dec(c.encrypted_api_key),dec(c.encrypted_api_secret),dec(c.encrypted_passphrase)]);
  const inst=String(row.inst_id),demo=st.demo_trading===true;
  const [bal,pos,meta,tick,cfg]=await Promise.all([api(k,s,p,"/api/v5/account/balance?ccy=USDT","GET",null,demo),api(k,s,p,"/api/v5/account/positions?instId="+encodeURIComponent(inst),"GET",null,demo),api(k,s,p,"/api/v5/public/instruments?instType=SWAP&instId="+encodeURIComponent(inst)),api(k,s,p,"/api/v5/market/ticker?instId="+encodeURIComponent(inst)),api(k,s,p,"/api/v5/account/config","GET",null,demo)]);
  const usdt=(bal[0]?.details??[]).find((x:OkxRecord)=>x.ccy==="USDT"),equity=Number(usdt?.eq??0),available=Number(usdt?.availBal??usdt?.availEq??0),open=(pos??[]).filter((x:OkxRecord)=>Math.abs(Number(x.pos??0))>0);
  if(cfg[0]?.posMode!=="net_mode")throw Error("okx_position_mode_must_be_net_mode");if(equity<=0||available<=0)throw Error("insufficient_usdt_balance");if(open.length>=Number(st.max_open_positions))throw Error("max_open_positions_reached");if(open.some((x:OkxRecord)=>x.instId===inst))throw Error("position_already_open");
  const m=meta[0],price=Number(tick[0]?.last??0),ct=Number(m?.ctVal),lot=Number(m?.lotSz),min=Number(m?.minSz),tickSize=Number(m?.tickSz),sl=Number(row.stop_loss),tp=Number(row.take_profit),side=row.side;
  if(!m||m.state!=="live"||price<=0||ct<=0||lot<=0||min<=0||tickSize<=0)throw Error("instrument_not_tradable_or_contract_metadata_missing");
  if(!(sl>0&&tp>0)||(side==="buy"&&!(sl<price&&tp>price))||(side==="sell"&&!(sl>price&&tp<price)))throw Error("protective_levels_invalid_at_current_market_price");
  const {data:risk}=await db.from("okx_futures_daily_risk").select("start_equity").eq("user_id",row.user_id).eq("risk_date",new Date().toISOString().slice(0,10)).maybeSingle();
  if(!risk){const {error:e}=await db.from("okx_futures_daily_risk").insert({user_id:row.user_id,start_equity:equity});if(e)throw e;}else if((Number(risk.start_equity)-equity)/Number(risk.start_equity)*100>=Number(st.max_daily_loss_pct))throw Error("daily_loss_limit_reached");
  const riskCash=equity*Number(st.risk_percent)/100,perContract=Math.abs(price-sl)*ct;let sz=stepFloor(riskCash/perContract,lot);sz=Math.min(sz,stepFloor(available*Number(st.leverage)*0.9/(price*ct),lot));if(sz<min)throw Error("minimum_contract_size_exceeds_risk_budget_or_margin");
  const executionCreatedAt=new Date();
  assertExecutionIntent({
   schemaVersion:1,
   intentId:row.id,
   idempotencyKey:executionIdempotencyKey("okx_futures", "okx_futures:"+row.user_id, row.id),
   userId:row.user_id,
   provider:"okx_futures",
   connectionId:"okx_futures:"+row.user_id,
   providerAccountId:row.user_id,
   environment:demo?"demo":"live",
   strategyId:"super_signal_8of8",
   strategyVersion:"super-signal-v1",
   signalId:row.signal_key,
   signalCreatedAt:new Date(Number(row.signal_epoch)*1000).toISOString(),
   expiresAt:new Date((Number(row.signal_epoch)+7200)*1000).toISOString(),
   order:{instrument:inst,side:side as "buy"|"sell",kind:"market",entryPrice:price,quantity:sz,stopLoss:sl,takeProfit:tp},
   risk:{maxLossAmount:sz*perContract,maxLossCurrency:"USDT",riskPercent:Number(st.risk_percent),maxOpenPositions:Number(st.max_open_positions),dailyLossLimitPercent:Number(st.max_daily_loss_pct),leverage:Number(st.leverage)},
   authorization:{liveExecutionAuthorized:st.live_execution_enabled===true,emergencyStop:st.emergency_stop===true,preflightVerifiedAt:executionCreatedAt.toISOString()},
   createdAt:executionCreatedAt.toISOString(),
  });
  await api(k,s,p,"/api/v5/account/set-leverage","POST",{instId:inst,lever:String(st.leverage),mgnMode:"cross"},demo);
  const attachedId=("stp"+(await stableClientId(row.id)).slice(2)).slice(0,32);
  const clientOrderId=await stableClientId(row.id);
  let order:OkxRecord[];
  try{
   order=await api(k,s,p,"/api/v5/trade/order","POST",{instId:inst,tdMode:"cross",side,ordType:"market",sz:String(sz),clOrdId:clientOrderId,attachAlgoOrds:[{attachAlgoClOrdId:attachedId,tpTriggerPx:String(Math.round(tp/tickSize)*tickSize),tpOrdPx:"-1",tpTriggerPxType:"mark",slTriggerPx:String(Math.round(sl/tickSize)*tickSize),slOrdPx:"-1",slTriggerPxType:"mark"}]},demo);
  }catch(submitError){
   if(!(submitError instanceof TypeError))throw submitError;
   try{
    order=await api(k,s,p,"/api/v5/trade/order?instId="+encodeURIComponent(inst)+"&clOrdId="+encodeURIComponent(clientOrderId),"GET",null,demo);
    if(!order[0]?.ordId)throw Error("okx_order_lookup_incomplete");
   }catch{
    await db.from("okx_futures_signal_intents").update({status:"uncertain",failure_reason:"network_outcome_uncertain; lookup_by_client_order_id_pending",updated_at:new Date().toISOString()}).eq("id",row.id);
    results.push({failed:true,id:row.id,error:"order_submission_outcome_uncertain"});
    continue;
   }
  }
  const oid=String(order[0]?.ordId??"");
  if(!oid)throw Error("exchange_order_id_missing");
  const check=await api(k,s,p,"/api/v5/trade/order?instId="+encodeURIComponent(inst)+"&ordId="+encodeURIComponent(oid),"GET",null,demo),filled=Number(check[0]?.accFillSz??0),avg=Number(check[0]?.avgPx??price);
  if(filled<=0)throw Error("market_order_not_filled");
  const attached=Array.isArray(check[0]?.attachAlgoOrds)?check[0].attachAlgoOrds:[],protection=attached.find((x:OkxRecord)=>x.attachAlgoClOrdId===attachedId||x.attachAlgoId);
  if(!protection){try{await api(k,s,p,"/api/v5/trade/order","POST",{instId:inst,tdMode:"cross",side:side==="buy"?"sell":"buy",ordType:"market",sz:String(filled),reduceOnly:true},demo);}catch(closeErr){console.error("URGENT OKX attached protection missing and emergency close failed",row.user_id,inst,String(closeErr));}throw Error("attached_stop_loss_take_profit_not_confirmed_position_close_attempted");}
  const algoId=String(protection.attachAlgoId??protection.attachAlgoClOrdId??attachedId);
  const {error:save}=await db.from("okx_futures_orders").insert({user_id:row.user_id,intent_id:row.id,signal_key:row.signal_key,inst_id:inst,side,sz:filled,entry_price:avg,stop_loss:sl,take_profit:tp,leverage:st.leverage,exchange_order_id:oid,exchange_algo_id:algoId,status:"protected",demo_trading:demo});if(save)throw save;
  await db.from("okx_futures_signal_intents").update({status:"executed",exchange_order_id:oid,exchange_algo_id:algoId,updated_at:new Date().toISOString()}).eq("id",row.id);results.push({executed:true,user_id:row.user_id,inst_id:inst,demo,order_id:oid,algo_id:algoId});
 }catch(e){const msg=e instanceof Error?e.message:"execution_failed";await db.from("okx_futures_signal_intents").update({status:"failed",failure_reason:msg.slice(0,240),updated_at:new Date().toISOString()}).eq("id",row.id);results.push({failed:true,id:row.id,error:msg});}}
 return out({ok:true,processed:results.length,executed:results.filter((x)=>x.executed).length,failed:results.filter((x)=>x.failed).length,results});
}catch(e){const msg=e instanceof Error?e.message:"okx_executor_error";console.error("[okx-futures-executor]",msg);return out({ok:false,error:msg.slice(0,240)},400);}});
