import {useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '@/lib/supabase';
type AuthState={ready:boolean;session:Session|null;isAdmin:boolean;isApproved:boolean;accessError:boolean;isPasswordRecovery:boolean};
async function checkAccess(userId:string):Promise<{isAdmin:boolean;isApproved:boolean}>{const a=await supabase.from('admin_users').select('user_id').eq('user_id',userId).maybeSingle();if(a.error)throw a.error;if(a.data)return{isAdmin:true,isApproved:true};const m=await supabase.from('member_access').select('user_id').eq('user_id',userId).maybeSingle();if(m.error)throw m.error;return{isAdmin:false,isApproved:m.data!==null}}
export function useAuthSession():AuthState{
const [state,setState]=useState<AuthState>({ready:false,session:null,isAdmin:false,isApproved:false,accessError:false,isPasswordRecovery:false});
useEffect(()=>{let active=true;let recovery=false;
const apply=async(session:Session|null,isRecovery=recovery)=>{recovery=isRecovery;if(!session){if(active)setState({ready:true,session:null,isAdmin:false,isApproved:false,accessError:false,isPasswordRecovery:false});return}try{const access=await checkAccess(session.user.id);if(active)setState({ready:true,session,...access,accessError:false,isPasswordRecovery:isRecovery})}catch{if(active)setState(s=>({...s,ready:true,session,accessError:true,isPasswordRecovery:isRecovery}))}};
supabase.auth.getSession().then(({data,error})=>{if(error){if(active)setState(s=>({...s,ready:true,accessError:true}));return}void apply(data.session,new URLSearchParams(location.search).get('auth')==='recovery')});
const {data:sub}=supabase.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY')void apply(session,true);else if(event==='SIGNED_OUT')void apply(null,false);else void apply(session,recovery)});
const retry=()=>{if(navigator.onLine)void supabase.auth.getSession().then(({data})=>apply(data.session,recovery))};window.addEventListener('online',retry);
return()=>{active=false;window.removeEventListener('online',retry);sub.subscription.unsubscribe()}},[]);
useEffect(()=>{const id=state.session?.user.id;if(!id||state.isApproved||state.accessError||state.isPasswordRecovery)return;let active=true;const timer=window.setInterval(()=>{checkAccess(id).then(a=>{if(active)setState(s=>s.session?.user.id===id?{...s,...a,accessError:false}:s)}).catch(()=>{if(active)setState(s=>s.session?.user.id===id?{...s,accessError:true}:s)})},10000);return()=>{active=false;window.clearInterval(timer)}},[state.session?.user.id,state.isApproved,state.accessError,state.isPasswordRecovery]);return state}
