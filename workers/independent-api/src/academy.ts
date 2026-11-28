import type { Env } from "./index";
type Account={ $id:string };
type ProgressRow={ $id:string; user_id:string; lesson_id:string; progress:number; completed_at:string|null; updated_at:string };
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const base=(env:Env)=>`${env.APPWRITE_ENDPOINT.replace(/\/$/,"")}/tablesdb/${env.APPWRITE_DATABASE_ID}/tables/${env.ACADEMY_PROGRESS_TABLE_ID}/rows`;
const headers=(env:Env)=>({"X-Appwrite-Project":env.APPWRITE_PROJECT_ID,"X-Appwrite-Key":env.APPWRITE_API_KEY!,"Content-Type":"application/json"});
async function idFor(userId:string,lessonId:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(userId+":"+lessonId));return [...new Uint8Array(bytes)].slice(0,16).map(x=>x.toString(16).padStart(2,"0")).join("")}
export async function handleAcademyProgress(request:Request,env:Env,account:Account):Promise<Response|null>{
 const url=new URL(request.url);if(url.pathname!=="/api/academy/progress")return null;
 if(!["GET","PUT"].includes(request.method))return json({error:"method_not_allowed"},405);
 if(!env.APPWRITE_API_KEY||!env.ACADEMY_PROGRESS_TABLE_ID)return json({error:"academy_progress_not_configured"},503);
 try{
  if(request.method==="GET"){
   const query=new URL(base(env));query.searchParams.append("queries[]",JSON.stringify({method:"equal",attribute:"user_id",values:[account.$id]}));query.searchParams.set("limit","500");
   const response=await fetch(query,{headers:headers(env)});if(!response.ok)return json({error:"academy_progress_read_failed"},503);
   const result=await response.json() as {rows?:ProgressRow[]};
   return json({lessons:(result.rows||[]).filter(row=>row.user_id===account.$id).map(row=>({lessonId:row.lesson_id,progress:row.progress,completedAt:row.completed_at||null,updatedAt:row.updated_at}))});
  }
  const body=await request.json().catch(()=>null) as {lessonId?:unknown;progress?:unknown}|null;
  if(!body||typeof body.lessonId!=="string"||body.lessonId.length<1||body.lessonId.length>128||typeof body.progress!=="number"||!Number.isFinite(body.progress)||body.progress<0||body.progress>100)return json({error:"invalid_academy_progress"},400);
  const rowId=await idFor(account.$id,body.lessonId);const endpoint=`${base(env)}/${encodeURIComponent(rowId)}`;
  const existing=await fetch(endpoint,{headers:headers(env)});if(!existing.ok&&existing.status!==404)return json({error:"academy_progress_read_failed"},503);
  const now=new Date().toISOString();const data={user_id:account.$id,lesson_id:body.lessonId,progress:body.progress,completed_at:body.progress===100?now:null,updated_at:now};
  const saved=await fetch(existing.ok?endpoint:base(env),{method:existing.ok?"PATCH":"POST",headers:headers(env),body:JSON.stringify(existing.ok?{data,permissions:[]}:{rowId,data,permissions:[]})});
  if(!saved.ok)return json({error:"academy_progress_save_failed"},503);
  const row=await saved.json() as ProgressRow;if(row.user_id!==account.$id)return json({error:"academy_progress_owner_mismatch"},403);
  return json({lessonId:row.lesson_id,progress:row.progress,completedAt:row.completed_at||null,updatedAt:row.updated_at});
 }catch{return json({error:"academy_progress_unavailable"},503)}
}
