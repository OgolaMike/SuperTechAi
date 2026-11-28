import { useCallback, useEffect, useState } from 'react';
import { listMyIndependentPayments, submitIndependentPayment, type IndependentPayment } from '@/lib/independentApi';

export function MembershipPaymentsPanel({ plan }: { plan: 'free' | 'standard_300' | 'automation_500' }) {
  const [reference,setReference]=useState('');
  const [payments,setPayments]=useState<IndependentPayment[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const load=useCallback(async()=>{try{const result=await listMyIndependentPayments();setPayments(result.payments)}catch{/* Membership page remains usable while payment service is unavailable. */}},[]);
  useEffect(()=>{void load()},[load]);
  const submit=async(planCode:'standard_300'|'automation_500')=>{
    setBusy(true);setMessage('');
    try{await submitIndependentPayment(planCode,reference.trim());setReference('');setMessage('Payment reference submitted. Your plan activates only after company verification.');await load()}
    catch(error){setMessage(error instanceof Error?error.message:'Payment submission failed.')}
    finally{setBusy(false)}
  };
  return <div className="mt-5 space-y-4 rounded-2xl border border-line/15 p-4">
    <div><h3 className="text-base font-semibold text-ink">Upgrade membership</h3><p className="mt-1 text-xs leading-5 text-ink-2">Pay using USDT on TRC20, then submit the transaction ID. Never share your wallet recovery phrase or private key.</p></div>
    <label className="block text-xs font-semibold text-ink-2">TRC20 transaction ID<input value={reference} onChange={event=>setReference(event.target.value)} maxLength={160} placeholder="Paste transaction hash" className="mt-2 w-full rounded-xl border border-line/20 bg-canvas px-3 py-3 text-sm text-ink"/></label>
    <div className="grid gap-2 sm:grid-cols-2"><button disabled={busy||reference.trim().length<20||plan!=='free'} onClick={()=>void submit('standard_300')} className="rounded-xl border border-line/20 px-3 py-3 text-sm font-semibold disabled:opacity-40">$300 Standard · Submit</button><button disabled={busy||reference.trim().length<20||plan!=='free'} onClick={()=>void submit('automation_500')} className="rounded-xl bg-accent px-3 py-3 text-sm font-semibold text-white disabled:opacity-40">$500 Premium · Submit</button></div>
    {plan!=='free'&&<p className="text-xs text-ink-3">Your current membership is active. Premium upgrades remain available to Standard members.</p>}
    {message&&<p role="status" className="rounded-xl border border-line/15 p-3 text-xs leading-5 text-ink-2">{message}</p>}
    <div className="space-y-2">{payments.map(payment=><div key={payment.id} className="flex flex-wrap justify-between gap-2 border-t border-line/10 pt-3 text-xs"><span>{payment.planCode==='automation_500'?'$500 Premium':'$300 Standard'} · {payment.reference.slice(0,12)}…</span><span className="font-semibold">{payment.status}</span></div>)}</div>
  </div>;
}
