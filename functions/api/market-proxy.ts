const ALLOWED_HOSTS = new Set([
  "www.okx.com","api.bybit.com","api.kucoin.com","api.gateio.ws",
  "api.bitget.com","api.mexc.com","api.coinex.com","open-api.bingx.com",
  "api-cloud.bitmart.com","api.binance.com",
]);
export const onRequestGet: PagesFunction = async ({request}) => {
  const requestUrl=new URL(request.url);
  const origin=request.headers.get("origin");
  if(origin&&origin!==requestUrl.origin)return new Response(JSON.stringify({error:"origin_not_allowed"}),{status:403,headers:{"content-type":"application/json"}});
  const raw=requestUrl.searchParams.get("url");
  if(!raw)return new Response(JSON.stringify({error:"missing_url"}),{status:400,headers:{"content-type":"application/json"}});
  let target:URL;
  try{target=new URL(raw)}catch{return new Response(JSON.stringify({error:"invalid_url"}),{status:400,headers:{"content-type":"application/json"}})}
  if(target.protocol!=="https:"||!ALLOWED_HOSTS.has(target.hostname)||target.username||target.password||target.port||target.hash)
    return new Response(JSON.stringify({error:"upstream_not_allowed"}),{status:403,headers:{"content-type":"application/json"}});
  try{
    const upstream=await fetch(target.toString(),{method:"GET",headers:{"accept":"application/json"},cf:{cacheTtl:20,cacheEverything:true}});
    const body=await upstream.text();
    return new Response(body,{status:upstream.status,headers:{"content-type":upstream.headers.get("content-type")||"application/json","cache-control":"public, max-age=15","x-content-type-options":"nosniff"}});
  }catch{return new Response(JSON.stringify({error:"upstream_unavailable"}),{status:502,headers:{"content-type":"application/json"}})}
};
