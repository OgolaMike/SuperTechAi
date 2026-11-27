import type { Env } from "./index";
type Account = { $id: string; email: string };
type PaymentRow = { $id: string; user_id: string; plan_code: string; amount_usd: number; currency: string; transaction_reference: string; status: string; submitted_at: string; reviewed_at?: string; reviewed_by?: string; review_note?: string };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const root=(env:Env,id:string)=>`${env.APPWRITE_ENDPOINT.replace(/\/$/,"")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${id}/rows`;
const headers=(env:Env)=>({"X-Appwrite-Project":env.APPWRITE_PROJECT_ID,"X-Appwrite-Key":env.APPWRITE_API_KEY!,"Content-Type":"application/json"});
const admin=(env:Env,account:Account)=>Boolean(env.GENESIS_ACCOUNT_ID&&account.$id===env.GENESIS_ACCOUNT_ID);
const plans={standard_300:300,automation_500:500} as const;
async function fetchJson<T>(url:string,env:Env,init:RequestInit={}):Promise<T>{
 const response=await fetch(url,{...init,headers:{...headers(env),...(init.headers||{})}});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error((payload as {message?:string}).message||"payment_storage_failed");
 return payload as T;
}

type NetworkRow = { user_id: string; sponsor_user_id: string; status: string };
type CommissionRow = { $id: string; user_id: string; source_user_id: string; commission_type: string; level?: number | null; amount: number; currency: string; status: string; reference_id: string; created_at: string };
async function stableRowId(value:string):Promise<string>{
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,32);
}
async function ensureCommission(env:Env,payment:PaymentRow,recipientId:string,type:string,amount:number,level:number|null,status:"pending"|"reserved"="pending"){
 if(!env.APPWRITE_API_KEY)throw new Error("commission_storage_not_configured");
 const table=root(env,"commission_records");
 const id=await stableRowId(["commission",payment.$id,type,recipientId,String(level??0)].join(":"));
 const endpoint=`${table}/${encodeURIComponent(id)}`;
 const existing=await fetch(endpoint,{headers:headers(env)});
 const now=new Date().toISOString();
 const data={user_id:recipientId,source_user_id:payment.user_id,commission_type:type,level,amount:Number(amount.toFixed(2)),currency:"USD",status,reference_id:payment.$id,created_at:now,paid_at:null};
 if(existing.ok){
  const row=await existing.json() as CommissionRow;
  if(row.user_id!==recipientId||row.source_user_id!==payment.user_id||row.commission_type!==type||row.reference_id!==payment.$id||Math.abs(row.amount-data.amount)>0.001)throw new Error("commission_record_conflict");
  return;
 }
 if(existing.status!==404)throw new Error("commission_record_read_failed");
 const created=await fetch(table,{method:"POST",headers:headers(env),body:JSON.stringify({rowId:id,data,permissions:[]})});
 if(created.ok)return;
 if(created.status===409){
  const raced=await fetch(endpoint,{headers:headers(env)});
  if(raced.ok){
   const row=await raced.json() as CommissionRow;
   if(row.user_id===recipientId&&row.source_user_id===payment.user_id&&row.commission_type===type&&row.reference_id===payment.$id&&Math.abs(row.amount-data.amount)<=0.001)return;
  }
 }
 throw new Error("commission_record_create_failed");
}
async function ensureCompanyShare(env:Env,payment:PaymentRow,genesisId:string){
 if(!env.FINANCIAL_LEDGER_TABLE_ID)throw new Error("financial_ledger_not_configured");
 const table=root(env,env.FINANCIAL_LEDGER_TABLE_ID);
 const id=await stableRowId(`company-share:${payment.$id}`);
 const endpoint=`${table}/${encodeURIComponent(id)}`;
 const existing=await fetch(endpoint,{headers:headers(env)});
 const amount=Number((payment.amount_usd*0.35).toFixed(2));
 if(existing.ok){
  const row=await existing.json() as {user_id?:string;reference_id?:string;amount?:number;entry_type?:string};
  if(row.user_id!==genesisId||row.reference_id!==payment.$id||row.entry_type!=="company_share"||Math.abs(Number(row.amount)-amount)>0.001)throw new Error("company_share_conflict");
  return;
 }
 if(existing.status!==404)throw new Error("company_share_read_failed");
 const created=await fetch(table,{method:"POST",headers:headers(env),body:JSON.stringify({rowId:id,data:{user_id:genesisId,entry_type:"company_share",amount,currency:"USD",reference_id:payment.$id,status:"confirmed",metadata_json:JSON.stringify({sourceUserId:payment.user_id,planCode:payment.plan_code}),created_at:new Date().toISOString()},permissions:[]})});
 if(created.ok)return;
 if(created.status===409){
  const raced=await fetch(endpoint,{headers:headers(env)});
  if(raced.ok){
   const row=await raced.json() as {user_id?:string;reference_id?:string;amount?:number;entry_type?:string};
   if(row.user_id===genesisId&&row.reference_id===payment.$id&&row.entry_type==="company_share"&&Math.abs(Number(row.amount)-amount)<=0.001)return;
  }
 }
 throw new Error("company_share_create_failed");
}
async function accrueMembershipCommissions(env:Env,payment:PaymentRow){
 const genesisId=env.GENESIS_ACCOUNT_ID;
 if(!genesisId)throw new Error("commission_admin_account_not_configured");
 const networkTable=env.MEMBER_NETWORK_TABLE_ID||"member_network";
 const networkBase=root(env,networkTable);
 const buyer=await fetch(`${networkBase}/${encodeURIComponent(payment.user_id)}`,{headers:headers(env)});
 let sponsorId=genesisId;
 if(buyer.ok){
  const row=await buyer.json() as NetworkRow;
  if(row.user_id!==payment.user_id)throw new Error("member_network_ownership_mismatch");
  if(row.sponsor_user_id)sponsorId=row.sponsor_user_id;
 }else if(buyer.status!==404)throw new Error("member_network_lookup_failed");
 const directAmount=payment.amount_usd*0.30;
 await ensureCommission(env,payment,sponsorId,"direct",directAmount,null,"pending");
 const visited=new Set<string>([payment.user_id]);
 let currentId=sponsorId;
 for(let level=1;level<=5&&currentId&&!visited.has(currentId);level++){
  visited.add(currentId);
  await ensureCommission(env,payment,currentId,"unilevel",payment.amount_usd*0.02,level,"pending");
  const ancestor=await fetch(`${networkBase}/${encodeURIComponent(currentId)}`,{headers:headers(env)});
  if(ancestor.status===404)break;
  if(!ancestor.ok)throw new Error("unilevel_upline_lookup_failed");
  const row=await ancestor.json() as NetworkRow;
  if(row.user_id!==currentId)throw new Error("unilevel_upline_ownership_mismatch");
  currentId=row.sponsor_user_id;
 }
 await ensureCommission(env,payment,genesisId,"infinity_pool",payment.amount_usd*0.20,null,"reserved");
 await ensureCommission(env,payment,genesisId,"just_4_you_pool",payment.amount_usd*0.05,null,"reserved");
 await ensureCompanyShare(env,payment,genesisId);
}

export async function handlePaymentRequest(request:Request,env:Env,account:Account):Promise<Response|null>{
 const url=new URL(request.url);
 if(!url.pathname.startsWith("/api/payments/")&&!url.pathname.startsWith("/api/admin/payments")&&url.pathname!=="/api/finance/ledger"&&url.pathname!=="/api/finance/commissions")return null;
 if(!env.APPWRITE_API_KEY||!env.PAYMENT_SUBMISSIONS_TABLE_ID)return json({error:"payment_storage_not_configured"},503);
 const base=root(env,env.PAYMENT_SUBMISSIONS_TABLE_ID);
 try{
  if(url.pathname==="/api/finance/commissions"&&request.method==="GET"){
   const q=new URL(root(env,"commission_records"));
   q.searchParams.append("queries[]",JSON.stringify({method:"equal",attribute:"user_id",values:[account.$id]}));
   q.searchParams.append("queries[]",JSON.stringify({method:"orderDesc",attribute:"created_at"}));q.searchParams.set("limit","200");
   const result=await fetchJson<{rows?:CommissionRow[]}>(q.toString(),env);
   const rows=(result.rows||[]).filter(row=>row.user_id===account.$id);
   return json({commissions:rows.map(row=>({id:row.$id,type:row.commission_type,level:row.level??null,amount:row.amount,currency:row.currency,status:row.status,sourceUserId:row.source_user_id,referenceId:row.reference_id,createdAt:row.created_at}))});
  }
  if(url.pathname==="/api/finance/ledger"&&request.method==="GET"){
   if(!env.FINANCIAL_LEDGER_TABLE_ID)return json({error:"financial_ledger_not_configured"},503);
   const ledgerBase=root(env,env.FINANCIAL_LEDGER_TABLE_ID);const q=new URL(ledgerBase);
   q.searchParams.append("queries[]",JSON.stringify({method:"equal",attribute:"user_id",values:[account.$id]}));
   q.searchParams.append("queries[]",JSON.stringify({method:"orderDesc",attribute:"created_at"}));q.searchParams.set("limit","200");
   const result=await fetchJson<{rows?:Array<{user_id:string;entry_type:string;amount:number;currency:string;reference_id:string;status:string;created_at:string}>}>(q.toString(),env);
   const rows=(result.rows||[]).filter(row=>row.user_id===account.$id);
   return json({entries:rows.map(row=>({type:row.entry_type,amount:row.amount,currency:row.currency,referenceId:row.reference_id,status:row.status,createdAt:row.created_at}))});
  }
  if(url.pathname==="/api/payments/me"&&request.method==="GET"){
   const q=new URL(base);q.searchParams.append("queries[]",JSON.stringify({method:"equal",attribute:"user_id",values:[account.$id]}));q.searchParams.append("queries[]",JSON.stringify({method:"orderDesc",attribute:"submitted_at"}));q.searchParams.set("limit","100");
   const result=await fetchJson<{rows?:PaymentRow[]}>(q.toString(),env);
   return json({payments:(result.rows||[]).filter(x=>x.user_id===account.$id).map(x=>({id:x.$id,planCode:x.plan_code,amountUsd:x.amount_usd,currency:x.currency,reference:x.transaction_reference,status:x.status,submittedAt:x.submitted_at,reviewedAt:x.reviewed_at||null,reviewNote:x.review_note||null}))});
  }
  if(url.pathname==="/api/payments/submit"&&request.method==="POST"){
   const body=await request.json().catch(()=>null) as {planCode?:unknown;currency?:unknown;transactionReference?:unknown}|null;
   if(!body||typeof body.planCode!=="string"||!Object.prototype.hasOwnProperty.call(plans,body.planCode)||!["USDT-TRC20"].includes(String(body.currency))||typeof body.transactionReference!=="string")return json({error:"invalid_payment_submission"},400);
   const reference=body.transactionReference.trim();
   if(!/^[a-fA-F0-9]{64}$/.test(reference))return json({error:"invalid_transaction_reference"},400);
   const existing=await fetchJson<{rows?:PaymentRow[]}>((()=>{const q=new URL(base);q.searchParams.append("queries[]",JSON.stringify({method:"equal",attribute:"transaction_reference",values:[reference]}));q.searchParams.set("limit","1");return q.toString()})(),env);
   if(existing.rows?.length)return json({error:"transaction_reference_already_submitted"},409);
   const now=new Date().toISOString();const id=crypto.randomUUID().replace(/-/g,"").slice(0,32);
   const row=await fetchJson<PaymentRow>(base,env,{method:"POST",body:JSON.stringify({rowId:id,data:{user_id:account.$id,plan_code:body.planCode,amount_usd:plans[body.planCode as keyof typeof plans],currency:"USDT-TRC20",transaction_reference:reference,status:"pending",submitted_at:now},permissions:[]})});
   return json({submitted:true,payment:{id:row.$id,planCode:row.plan_code,amountUsd:row.amount_usd,status:row.status}},201);
  }
  if(url.pathname==="/api/admin/payments"&&request.method==="GET"){
   if(!admin(env,account))return json({error:"company_admin_required"},403);
   const q=new URL(base);q.searchParams.append("queries[]",JSON.stringify({method:"orderDesc",attribute:"submitted_at"}));q.searchParams.set("limit","100");
   const result=await fetchJson<{rows?:PaymentRow[]}>(q.toString(),env);
   return json({payments:(result.rows||[]).map(x=>({id:x.$id,userId:x.user_id,planCode:x.plan_code,amountUsd:x.amount_usd,currency:x.currency,reference:x.transaction_reference,status:x.status,submittedAt:x.submitted_at}))});
  }
  const match=url.pathname.match(/^\/api\/admin\/payments\/([a-f0-9]{32})$/i);
  if(match&&request.method==="POST"){
   if(!admin(env,account))return json({error:"company_admin_required"},403);
   const body=await request.json().catch(()=>null) as {action?:string;note?:string}|null;
   if(!body||!["approve","reject"].includes(body.action||"")||(body.note!==undefined&&(typeof body.note!=="string"||body.note.length>500)))return json({error:"invalid_payment_review"},400);
   const payment=await fetchJson<PaymentRow>(`${base}/${match[1]}`,env);
   if(payment.status!=="pending")return json({error:"payment_already_reviewed"},409);
   const now=new Date().toISOString();const approved=body.action==="approve";
   if(approved){
    const memberBase=root(env,env.MEMBERSHIP_TABLE_ID||"membership_requests");
    const member=await fetchJson<Record<string,unknown>>(`${memberBase}/${encodeURIComponent(payment.user_id)}`,env).catch(()=>null);
    const targetUser=member?null:await fetchJson<{email:string}>(`${env.APPWRITE_ENDPOINT.replace(/\/$/, "")}/users/${encodeURIComponent(payment.user_id)}`,env).catch(()=>null);
    const data={user_id:payment.user_id,email:String(member?.email||targetUser?.email||""),status:"approved",plan_code:payment.plan_code,updated_at:now,reviewed_at:now,reviewed_by:account.$id,review_note:"Payment approved by company administrator."};
    if(!data.email)return json({error:"member_email_unavailable"},409);
    const ledgerBase=root(env,env.FINANCIAL_LEDGER_TABLE_ID||"financial_ledger");
    const ledgerId=payment.$id;
    const priorLedger=await fetch(`${ledgerBase}/${encodeURIComponent(ledgerId)}`,{headers:headers(env)});
    if(priorLedger.status===404){
     await fetchJson(ledgerBase,env,{method:"POST",body:JSON.stringify({rowId:ledgerId,data:{user_id:payment.user_id,entry_type:"membership_payment",amount:payment.amount_usd,currency:"USD",reference_id:payment.$id,status:"confirmed",metadata_json:JSON.stringify({paymentReference:payment.transaction_reference,planCode:payment.plan_code}),created_at:now},permissions:[]})});
    }else if(priorLedger.ok){
     const prior=await priorLedger.json() as {user_id?:string;reference_id?:string;amount?:number};
     if(prior.user_id!==payment.user_id||prior.reference_id!==payment.$id||prior.amount!==payment.amount_usd)return json({error:"payment_ledger_conflict"},409);
    }else return json({error:"payment_ledger_read_failed"},503);
    await accrueMembershipCommissions(env,payment);
    if(member)await fetchJson(`${memberBase}/${encodeURIComponent(payment.user_id)}`,env,{method:"PATCH",body:JSON.stringify({data,permissions:[]})});
    else await fetchJson(memberBase,env,{method:"POST",body:JSON.stringify({rowId:payment.user_id,data:{...data,created_at:now},permissions:[]})});
   }
   const saved=await fetchJson<PaymentRow>(`${base}/${match[1]}`,env,{method:"PATCH",body:JSON.stringify({data:{status:approved?"approved":"rejected",reviewed_at:now,reviewed_by:account.$id,review_note:(body.note||"").trim()},permissions:[]})});
   return json({updated:true,status:saved.status});
  }
  return json({error:"method_not_allowed"},405);
 }catch(error){return json({error:error instanceof Error?error.message:"payment_service_failed"},503)}
}
