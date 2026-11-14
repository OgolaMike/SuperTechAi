import { createClient } from "npm:@supabase/supabase-js@2";
import { exchangeGatewayFetch } from "../_shared/exchange-gateway.ts";

type OkxRecord = Record<string, unknown>;
type OkxSignalIntent = {
 id: string;
 user_id: string;
 signal_key: string;
 inst_id?: string | null;
 symbol?: string | null;
 side: "buy" | "sell";
 timeframe_agreement: number;
 signal_epoch: number;
 stop_loss: number | string;
 take_profit: number | string;
};
type OkxExecutionResult = {
 executed?: boolean;
 failed?: boolean;
 userId?: string;
 inst?: string;
 side?: string;
 sz?: number;
 entry?: number;
 stopLoss?: number;
 takeProfit?: number;
 demo?: boolean;
 orderId?: string;
 algoId?: string;
 id?: string;
 error?: string;
};
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,x-client-info,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS"};
const reply=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const enc=new TextEncoder();
const url=Deno.env.get("SUPABASE_URL")!;
const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin=createClient(url,service,{auth:{persistSession:false}});
async function aesKey(usages:KeyUsage[]){const secret=Deno.env.get("BINANCE_CREDENTIALS_ENCRYPTION_KEY");if(!secret||secret.length<32)throw Error("exchange_credentials_encryption_key_not_configured");const digest=await crypto.subtle.digest("SHA-256",enc.encode(secret));return crypto.subtle.importKey("raw",digest,"AES-GCM",false,usages);}
async function encrypt(v:string){const iv=crypto.getRandomValues(new Uint8Array(12));const data=await crypto.subtle.encrypt({name:"AES-GCM",iv},await aesKey(["encrypt"]),enc.encode(v));return btoa(String.fromCharCode(...new Uint8Array([...iv,...new Uint8Array(data)])));}
async function decrypt(v:string){const b=Uint8Array.from(atob(v),c=>c.charCodeAt(0));return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:b.slice(0,12)},await aesKey(["decrypt"]),b.slice(12)));}
async function signature(secret:string,message:string){const k=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC",k,enc.encode(message)))));}
async function okx(k:string,s:string,p:string,path:string,method="GET",body:Record<string,unknown>|null=null,demo=false){
 const ts=new Date().toISOString(),payload=body?JSON.stringify(body):"",sign=await signature(s,ts+method+path+payload);
 let r:Response;try{r=await exchangeGatewayFetch("okx","https://openapi.okx.com"+path,{method,headers:{"OK-ACCESS-KEY":k,"OK-ACCESS-SIGN":sign,"OK-ACCESS-TIMESTAMP":ts,"OK-ACCESS-PASSPHRASE":p,"Content-Type":"application/json",...(demo?{"x-simulated-trading":"1"}:{})},...(body?{body:payload}:{})});}catch{throw Error("okx_network_outcome_uncertain");}
 const d=await r.json();if(!r.ok||d.code!=="0")throw Error("OKX "+(d.code??r.status)+": "+(d.msg??"API request rejected"));
 const bad=(d.data??[]).find((x:OkxRecord)=>typeof x.sCode==="string"&&x.sCode!=="0");if(bad)throw Error("OKX "+String(bad.sCode)+": "+String(bad.sMsg??"request rejected"));
 return d.data??[];
}
async function getCred(userId:string){const {data,error}=await admin.from("okx_futures_credentials").select("*").eq("user_id",userId).maybeSingle();if(error||!data)throw Error("okx_account_not_connected");const [k,s,p]=await Promise.all([decrypt(data.encrypted_api_key),decrypt(data.encrypted_api_secret),decrypt(data.encrypted_passphrase)]);return{k,s,p};}
async function preflight(k:string,s:string,p:string,demo:boolean){
 const [cfg,balance,positions]=await Promise.all([okx(k,s,p,"/api/v5/account/config","GET",null,demo),okx(k,s,p,"/api/v5/account/balance?ccy=USDT","GET",null,demo),okx(k,s,p,"/api/v5/account/positions?instType=SWAP","GET",null,demo)]);
 const c=(cfg[0]??{}) as OkxRecord,u=(balance[0]?.details??[]).find((x:OkxRecord)=>x.ccy==="USDT");
 return{connected:true,demoTrading:demo,accountLevel:c.acctLv??null,positionMode:c.posMode??null,usdtEquity:Number(u?.eq??0),usdtAvailable:Number(u?.availBal??u?.availEq??0),openPositions:(positions??[]).filter((x:OkxRecord)=>Math.abs(Number(x.pos??0))>0).length,canTrade:true,note:"Credentials and account access verified. No order was placed."};
}

function floorTo(n:number,step:number){return Math.floor((n+1e-10)/step)*step;}
function instId(symbol:string){const s=symbol.toUpperCase();if(!s.endsWith("USDT"))throw Error("okx_only_usdt_perpetuals_supported");return s.slice(0,-4)+"-USDT-SWAP";}
async function executeIntent(row:OkxSignalIntent){
 const userId=row.user_id;
 const {data:settings,error:se}=await admin.from("okx_futures_settings").select("*").eq("user_id",userId).maybeSingle();if(se||!settings)throw Error("okx_settings_missing");
 if(settings.connection_status!=="connected"||!settings.auto_trade_enabled||settings.emergency_stop)throw Error("okx_automation_not_enabled");
 if(settings.demo_trading!==true&&settings.live_execution_enabled!==true)throw Error("okx_live_execution_not_enabled");
 if(row.timeframe_agreement!==8||Math.floor(Date.now()/1000)-Number(row.signal_epoch)>7200||Number(row.signal_epoch)>Math.floor(Date.now()/1000)+30)throw Error("okx_signal_not_fresh_8_of_8");
 const inst=instId(String(row.inst_id??row.symbol??"")),{k,s,p}=await getCred(userId),demo=settings.demo_trading===true;
 const [account,positions,instruments,ticker]=await Promise.all([
  okx(k,s,p,"/api/v5/account/balance?ccy=USDT","GET",null,demo),
  okx(k,s,p,"/api/v5/account/positions?instId="+encodeURIComponent(inst),"GET",null,demo),
  okx(k,s,p,"/api/v5/public/instruments?instType=SWAP&instId="+encodeURIComponent(inst)),
  okx(k,s,p,"/api/v5/market/ticker?instId="+encodeURIComponent(inst))
 ]);
 const detail=(account[0]?.details??[]).find((x:OkxRecord)=>x.ccy==="USDT"),equity=Number(detail?.eq??0),available=Number(detail?.availBal??detail?.availEq??0);
 if(!(equity>0)||!(available>0))throw Error("okx_insufficient_usdt_balance");
 const pos=(positions??[]).filter((x:OkxRecord)=>Math.abs(Number(x.pos??0))>0);
 if(pos.length>=Number(settings.max_open_positions))throw Error("okx_max_open_positions_reached");
 if(pos.some((x:OkxRecord)=>x.instId===inst))throw Error("okx_position_already_open_for_symbol");
 const instrument=instruments[0],price=Number(ticker[0]?.last??0);
 if(!instrument||instrument.state!=="live"||!(price>0))throw Error("okx_instrument_not_tradable");
 const ctVal=Number(instrument.ctVal),lot=Number(instrument.lotSz),min=Number(instrument.minSz),tick=Number(instrument.tickSz);
 if(!(ctVal>0&&lot>0&&min>0&&tick>0))throw Error("okx_contract_specification_invalid");
 const entry=price,sl=Number(row.stop_loss),tp=Number(row.take_profit),side=row.side;
 if(!(sl>0&&tp>0)||(side==="buy"&&!(sl<entry&&tp>entry))||(side==="sell"&&!(sl>entry&&tp<entry)))throw Error("okx_invalid_protective_price_levels");
 const riskCash=equity*Number(settings.risk_percent)/100,perContract=Math.abs(entry-sl)*ctVal;
 let sz=floorTo(riskCash/perContract,lot);if(sz<min)throw Error("okx_minimum_contract_size_exceeds_risk_budget");
 const maxByMargin=floorTo((available*Number(settings.leverage)*0.9)/(entry*ctVal),lot);sz=Math.min(sz,maxByMargin);
 if(sz<min)throw Error("okx_available_margin_too_low");
 const today=new Date().toISOString().slice(0,10);
 const {data:risk}=await admin.from("okx_futures_daily_risk").select("start_equity").eq("user_id",userId).eq("risk_date",today).maybeSingle();
 if(!risk){const {error}=await admin.from("okx_futures_daily_risk").insert({user_id:userId,risk_date:today,start_equity:equity});if(error&& !String(error.message).includes("duplicate"))throw error;}
 else if((Number(risk.start_equity)-equity)/Number(risk.start_equity)*100>=Number(settings.max_daily_loss_pct))throw Error("okx_daily_loss_limit_reached");
 await okx(k,s,p,"/api/v5/account/set-leverage","POST",{instId:inst,lever:String(settings.leverage),mgnMode:"cross"},demo);
 const clOrdId=("st"+crypto.randomUUID().replaceAll("-","")).slice(0,32);
 const placed=await okx(k,s,p,"/api/v5/trade/order","POST",{instId:inst,tdMode:"cross",side,ordType:"market",sz:String(sz),clOrdId},demo);
 const orderId=String(placed[0]?.ordId??"");if(!orderId)throw Error("okx_order_id_missing");
 const detailOrder=await okx(k,s,p,"/api/v5/trade/order?instId="+encodeURIComponent(inst)+"&ordId="+encodeURIComponent(orderId),"GET",null,demo);
 const filled=Number(detailOrder[0]?.accFillSz??0),avg=Number(detailOrder[0]?.avgPx??entry);
 if(filled<=0||filled<sz-1e-10)throw Error("okx_market_order_not_fully_filled_check_exchange_order");
 const trigger=(n:number)=>String(Math.round(n/tick)*tick);
 let algoId="";
 try{
  const algo=await okx(k,s,p,"/api/v5/trade/order-algo","POST",{instId:inst,tdMode:"cross",side:side==="buy"?"sell":"buy",ordType:"conditional",sz:String(filled),reduceOnly:true,slTriggerPx:trigger(sl),slOrdPx:"-1",slTriggerPxType:"mark",tpTriggerPx:trigger(tp),tpOrdPx:"-1",tpTriggerPxType:"mark"},demo);
  algoId=String(algo[0]?.algoId??"");if(!algoId)throw Error("okx_protection_id_missing");
 }catch(e){
  // Fail closed: attempt to flatten immediately if the protective bracket is rejected.
  try{await okx(k,s,p,"/api/v5/trade/order","POST",{instId:inst,tdMode:"cross",side:side==="buy"?"sell":"buy",ordType:"market",sz:String(filled),reduceOnly:true},demo);}catch(closeError){console.error("CRITICAL: OKX protection failed and emergency close was rejected",{userId,inst,orderId,closeError:String(closeError)});}
  throw Error("okx_protective_orders_failed_position_close_attempted: "+(e instanceof Error?e.message:"unknown"));
 }
 const {error:saveError}=await admin.from("okx_futures_orders").insert({user_id:userId,intent_id:row.id,signal_key:row.signal_key,inst_id:inst,side,sz:filled,entry_price:avg,stop_loss:sl,take_profit:tp,leverage:settings.leverage,exchange_order_id:orderId,exchange_algo_id:algoId,status:"protected",demo_trading:demo});
 if(saveError)throw saveError;
 const {error:updateError}=await admin.from("okx_futures_signal_intents").update({status:"executed",exchange_order_id:orderId,exchange_algo_id:algoId,updated_at:new Date().toISOString()}).eq("id",row.id);
 if(updateError)throw updateError;
 return{executed:true,userId,inst,side,sz:filled,entry:avg,stopLoss:sl,takeProfit:tp,demo,orderId,algoId};
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return reply({error:"method_not_allowed"},405);
 try{
  const authorization=req.headers.get("Authorization")??"",token=authorization.replace(/^Bearer\s+/i,""),body=await req.json(),action=String(body.action??"");
  const serviceCall=token===service&&service.length>20;
  let userId="";
  if(!serviceCall){if(!token||token===authorization)return reply({error:"authentication_required"},401);const user=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});const {data,error}=await user.auth.getUser(token);if(error||!data.user)return reply({error:"invalid_session"},401);userId=data.user.id;}
  if(action==="execute_pending"){
   if(!serviceCall)return reply({error:"service_authorization_required"},403);
   const {data:pending,error}=await admin.from("okx_futures_signal_intents").select("*").eq("status","signal_ready").order("created_at",{ascending:true}).limit(100);if(error)throw error;
   const results:OkxExecutionResult[]=[];for(const row of pending??[]){try{const {data:claim,error:claimError}=await admin.from("okx_futures_signal_intents").update({status:"processing",updated_at:new Date().toISOString()}).eq("id",row.id).eq("status","signal_ready").select("id");if(claimError)throw claimError;if(!claim?.length)continue;results.push(await executeIntent(row));}catch(e){const message=e instanceof Error?e.message:"okx_execution_failed";await admin.from("okx_futures_signal_intents").update({status:"failed",failure_reason:message.slice(0,240),updated_at:new Date().toISOString()}).eq("id",row.id);console.error("[okx-executor] intent failed",{id:row.id,message});results.push({failed:true,id:row.id,error:message});}}
   return reply({ok:true,processed:results.length,executed:results.filter((x)=>x.executed).length,failed:results.filter((x)=>x.failed).length,results});
  }
  if(action==="connect"){
   const k=String(body.apiKey??"").trim(),s=String(body.apiSecret??"").trim(),p=String(body.passphrase??""),demo=body.demoTrading!==false;
   if(k.length<8||k.length>256||s.length<8||s.length>256||!p||p.length>256)return reply({error:"Enter a valid OKX API key, secret and passphrase."},400);
   const account=await preflight(k,s,p,demo),last4=k.slice(-4),[ek,es,ep]=await Promise.all([encrypt(k),encrypt(s),encrypt(p)]);
   const {error:ce}=await admin.from("okx_futures_credentials").upsert({user_id:userId,encrypted_api_key:ek,encrypted_api_secret:es,encrypted_passphrase:ep,api_key_last4:last4,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(ce)throw ce;
   const {error:se}=await admin.from("okx_futures_settings").upsert({user_id:userId,connection_status:"connected",demo_trading:demo,auto_trade_enabled:false,live_execution_enabled:false,emergency_stop:true,api_key_last4:last4,account_label:"OKX USDT Perpetuals",account_mode:account.positionMode,last_checked_at:new Date().toISOString(),last_error_code:null,updated_at:new Date().toISOString()},{onConflict:"user_id"});if(se)throw se;return reply({ok:true,account});
  }
  if(action==="status"){
   const [{data:settings,error:se},{data:orders,error:oe},{data:intents,error:ie}]=await Promise.all([admin.from("okx_futures_settings").select("*").eq("user_id",userId).maybeSingle(),admin.from("okx_futures_orders").select("id,inst_id,side,sz,entry_price,stop_loss,take_profit,status,demo_trading,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(20),admin.from("okx_futures_signal_intents").select("id,inst_id,side,timeframe_agreement,signal_epoch,status,failure_reason,created_at").eq("user_id",userId).order("created_at",{ascending:false}).limit(20)]);if(se)throw se;if(oe)throw oe;if(ie)throw ie;return reply({ok:true,settings,orders:orders??[],intents:intents??[]});
  }
  if(action==="test_connection"){
   const c=await getCred(userId),{data:st}=await admin.from("okx_futures_settings").select("demo_trading").eq("user_id",userId).maybeSingle(),account=await preflight(c.k,c.s,c.p,st?.demo_trading!==false);await admin.from("okx_futures_settings").update({connection_status:"connected",account_mode:account.positionMode,last_checked_at:new Date().toISOString(),last_error_code:null}).eq("user_id",userId);return reply({ok:true,account});
  }
  if(action==="settings"){
   const {data:current,error:ce}=await admin.from("okx_futures_settings").select("connection_status").eq("user_id",userId).maybeSingle();if(ce)throw ce;if(current?.connection_status!=="connected")return reply({error:"connect_okx_first"},409);
   const leverage=Number(body.leverage),risk=Number(body.riskPercent),daily=Number(body.maxDailyLossPct),max=Number(body.maxOpenPositions),demo=body.demoTrading===true,emergency=body.emergencyStop!==false;
   if(!Number.isInteger(leverage)||leverage<1||leverage>20||!Number.isFinite(risk)||risk<=0||risk>2||!Number.isFinite(daily)||daily<=0||daily>5||!Number.isInteger(max)||max<1||max>10)return reply({error:"Invalid risk controls. Leverage 1–20x, risk up to 2%, daily loss up to 5%, positions 1–10."},400);
   if(!demo&&body.liveExecutionEnabled!==true)return reply({error:"Explicitly enable live execution to switch from demo to live."},409);
   const {error}=await admin.from("okx_futures_settings").update({demo_trading:demo,leverage,risk_percent:risk,max_daily_loss_pct:daily,max_open_positions:max,emergency_stop:emergency,auto_trade_enabled:body.autoTradeEnabled===true&&!emergency,live_execution_enabled:!demo&&body.liveExecutionEnabled===true&&!emergency,updated_at:new Date().toISOString()}).eq("user_id",userId);if(error)throw error;return reply({ok:true,message:"OKX risk and execution settings saved."});
  }
  if(action==="disconnect"){await admin.from("okx_futures_credentials").delete().eq("user_id",userId);const {error}=await admin.from("okx_futures_settings").update({connection_status:"not_connected",auto_trade_enabled:false,live_execution_enabled:false,emergency_stop:true,api_key_last4:null,account_label:null,account_mode:null,updated_at:new Date().toISOString()}).eq("user_id",userId);if(error)throw error;return reply({ok:true});}
  return reply({error:"unsupported_action"},400);
 }catch(e){const m=e instanceof Error?e.message:"okx_futures_error";console.error("[okx-futures]",m);return reply({ok:false,error:m.slice(0,240),message:m.slice(0,240)},400);}
});