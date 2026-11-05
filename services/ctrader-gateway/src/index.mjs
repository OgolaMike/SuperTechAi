import http from "node:http";
import { randomUUID, createDecipheriv, createCipheriv, randomBytes } from "node:crypto";

const env = process.env;
const required = ["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","CTRADER_CLIENT_ID","CTRADER_CLIENT_SECRET","CTRADER_TOKEN_ENCRYPTION_KEY"];
for (const key of required) if (!env[key]) throw new Error(`Missing environment variable: ${key}`);
const cfg = {
  base: env.SUPABASE_URL.replace(/\/$/, ""),
  key: env.SUPABASE_SERVICE_ROLE_KEY,
  clientId: env.CTRADER_CLIENT_ID,
  clientSecret: env.CTRADER_CLIENT_SECRET,
  encryptionKey: Buffer.from(env.CTRADER_TOKEN_ENCRYPTION_KEY,"base64"),
  owner: env.GATEWAY_INSTANCE_ID || `gateway-${randomUUID()}`,
  port: Number(env.PORT || 8080),
  pollMs: Math.max(10000, Number(env.POLL_INTERVAL_MS || 15000)),
};
if (cfg.encryptionKey.length !== 32) throw new Error("Encryption key must be base64-encoded 32 bytes");
const headers = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}`, "Content-Type":"application/json" };
const log = (event, data={}) => console.log(JSON.stringify({at:new Date().toISOString(),event,...data}));
const rest = async (path, init={}) => {
  const res = await fetch(`${cfg.base}/rest/v1/${path}`,{...init,headers:{...headers,...(init.headers||{})}});
  if (!res.ok) throw new Error(`supabase_${res.status}_${(await res.text()).slice(0,160)}`);
  return res.status===204 ? null : res.json();
};
const decrypt = packed => {
  const [v,iv64,data64] = String(packed).split(".");
  if(v!=="v1"||!iv64||!data64) throw new Error("invalid_ciphertext");
  const iv=Buffer.from(iv64,"base64"), all=Buffer.from(data64,"base64");
  const d=createDecipheriv("aes-256-gcm",cfg.encryptionKey,iv);
  d.setAuthTag(all.subarray(-16));
  return Buffer.concat([d.update(all.subarray(0,-16)),d.final()]).toString("utf8");
};
const encrypt = plain => {
  const iv=randomBytes(12), c=createCipheriv("aes-256-gcm",cfg.encryptionKey,iv);
  const body=Buffer.concat([c.update(plain,"utf8"),c.final()]);
  return `v1.${iv.toString("base64")}.${Buffer.concat([body,c.getAuthTag()]).toString("base64")}`;
};
async function loadGrant(userId) {
  const rows=await rest(`ctrader_oauth_grants?user_id=eq.${userId}&status=eq.active&select=id,encrypted_access_token,encrypted_refresh_token,token_expires_at&order=created_at.desc&limit=1`);
  if(!rows?.length) return null;
  const g=rows[0];
  let access=decrypt(g.encrypted_access_token), refresh=decrypt(g.encrypted_refresh_token);
  if(Date.parse(g.token_expires_at)<Date.now()+15*60*1000) {
    const u=new URL("https://openapi.ctrader.com/apps/token");
    u.search=new URLSearchParams({grant_type:"refresh_token",refresh_token:refresh,client_id:cfg.clientId,client_secret:cfg.clientSecret}).toString();
    const response=await fetch(u,{method:"POST",headers:{Accept:"application/json"}});
    const next=await response.json();
    if(!response.ok||!next.accessToken||!next.refreshToken||next.errorCode) throw new Error("ctrader_token_refresh_failed");
    access=next.accessToken; refresh=next.refreshToken;
    await rest(`ctrader_oauth_grants?id=eq.${g.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({
      encrypted_access_token:encrypt(access),encrypted_refresh_token:encrypt(refresh),
      token_expires_at:new Date(Date.now()+Number(next.expiresIn)*1000).toISOString(),updated_at:new Date().toISOString()
    })});
    log("oauth_token_refreshed",{userId});
  }
  return {id:g.id,access};
}
class CTraderSocket {
  constructor(environment) { this.environment=environment; this.ws=null; this.pending=new Map(); this.authenticated=false; this.accounts=new Set(); this.heartbeat=null; }
  async connect() {
    if(this.ws?.readyState===WebSocket.OPEN && this.authenticated) return;
    await this.close();
    const host=this.environment==="live"?"wss://live.ctraderapi.com:5036":"wss://demo.ctraderapi.com:5036";
    const ws=new WebSocket(host); this.ws=ws;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("ctrader_connect_timeout")),12000);
      ws.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});
      ws.addEventListener("error",()=>{clearTimeout(timer);reject(new Error("ctrader_socket_error"));},{once:true});
    });
    ws.addEventListener("message",event=>this.onMessage(event));
    ws.addEventListener("close",()=>{this.authenticated=false;this.accounts.clear();clearInterval(this.heartbeat);this.heartbeat=null;});
    await this.request(2100,{clientId:cfg.clientId,clientSecret:cfg.clientSecret},2101);
    this.authenticated=true;
    this.heartbeat=setInterval(()=>{if(this.ws?.readyState===WebSocket.OPEN)this.ws.send(JSON.stringify({payloadType:51,payload:{}}));},10000);
    log("ctrader_environment_connected",{environment:this.environment});
  }
  onMessage(event) {
    let m; try {m=JSON.parse(typeof event.data==="string"?event.data:Buffer.from(event.data).toString("utf8"));} catch{return;}
    const accountId=String(m.payload?.ctidTraderAccountId||"");
    if(m.payloadType===50) {
      for(const [id,p] of this.pending) { if(!accountId||p.accountId===accountId){clearTimeout(p.timer);this.pending.delete(id);p.reject(new Error(String(m.payload?.errorCode||"ctrader_api_error")));break;} }
      return;
    }
    for(const [id,p] of this.pending) {
      if(m.payloadType===p.expected && (!p.accountId||!accountId||p.accountId===accountId)) {
        clearTimeout(p.timer);this.pending.delete(id);p.resolve(m.payload||{});break;
      }
    }
  }
  request(type,payload,expected,accountId=null) {
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN) return Promise.reject(new Error("ctrader_socket_not_open"));
    const id=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error("ctrader_response_timeout"));},10000);
      this.pending.set(id,{expected,accountId,resolve,reject,timer});
      this.ws.send(JSON.stringify({clientMsgId:id,payloadType:type,payload}));
    });
  }
  async authorize(accountId,accessToken) {
    await this.connect();
    if(this.accounts.has(accountId)) return;
    await this.request(2102,{ctidTraderAccountId:Number(accountId),accessToken},2103,accountId);
    this.accounts.add(accountId);
    log("ctrader_account_session_authorized",{environment:this.environment,accountId});
  }
  async close() {
    clearInterval(this.heartbeat);this.heartbeat=null;
    for(const [id,p] of this.pending){clearTimeout(p.timer);p.reject(new Error("socket_closed"));this.pending.delete(id);}
    if(this.ws){try{this.ws.close();}catch{}}
    this.ws=null;this.authenticated=false;this.accounts.clear();
  }
}
const sockets={demo:new CTraderSocket("demo"),live:new CTraderSocket("live")};
let running=true, busy=false;
async function cycle() {
  if(busy||!running)return; busy=true;
  try {
    const connections=await rest("ctrader_connections?connection_status=eq.connected&select=id,user_id,ctrader_account_id,environment&order=created_at.asc");
    const seen=new Set();
    for(const c of connections||[]) {
      const lease=await rest("rpc/claim_ctrader_runtime_lease",{method:"POST",body:JSON.stringify({p_connection_id:c.id,p_lease_owner:cfg.owner,p_ttl_seconds:45})});
      if(lease!==true) continue;
      seen.add(c.id);
      try {
        const grant=await loadGrant(c.user_id);
        if(!grant) throw new Error("active_oauth_grant_missing");
        await sockets[c.environment].authorize(c.ctrader_account_id,grant.access);
        await rest(`ctrader_connections?id=eq.${c.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_seen_at:new Date().toISOString(),last_error_code:null})});
      } catch(error) {
        log("account_session_error",{connectionId:c.id,code:error.message});
        await rest(`ctrader_connections?id=eq.${c.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({last_error_code:String(error.message).slice(0,120)})}).catch(()=>{});
      }
    }
    for(const envName of ["demo","live"]) {
      if(sockets[envName].ws && sockets[envName].ws.readyState!==WebSocket.OPEN) await sockets[envName].close();
    }
    log("gateway_cycle_complete",{accounts:(connections||[]).length,instance:cfg.owner});
  } catch(error) { log("gateway_cycle_failed",{code:String(error.message).slice(0,180)}); }
  finally { busy=false; }
}
const server=http.createServer((req,res)=>{
  if(req.url==="/health"){res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({ok:true,service:"supertechai-ctrader-gateway",tradingEnabled:false,instance:cfg.owner}));return;}
  res.writeHead(404);res.end();
});
server.listen(cfg.port,()=>log("gateway_started",{port:cfg.port,instance:cfg.owner}));
await cycle();
const poll=setInterval(cycle,cfg.pollMs);
async function shutdown(){running=false;clearInterval(poll);await Promise.all(Object.values(sockets).map(s=>s.close()));server.close(()=>process.exit(0));}
process.on("SIGTERM",shutdown);process.on("SIGINT",shutdown);
