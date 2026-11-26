import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperSignal } from '@/lib/intelligence';
import { fetchIndependentSuperSignalRecords, upsertIndependentSuperSignalRecords } from '@/lib/independentApi';

export type SuperSignalRecord = {
  signal_key:string; symbol:string; asset_name:string; digits:number; direction:'BUY'|'SELL';
  signal_epoch:number; entry:number; stop_loss:number; tp1:number; tp2:number; tp3:number;
  band_mean:number; band_deviation:number; daily_bias:string; reads:SuperSignal['reads'];
  explanation:string; grade_percent:number|null; confirmation_timeframe:string|null;
  confirmation_epoch:number|null; status:'Open'|'TP1'|'TP2'|'TP3'|'Stopped'|'Reversed';
  tp1_hit_epoch:number|null; tp2_hit_epoch:number|null; tp3_hit_epoch:number|null;
  sl_hit_epoch:number|null; closed:boolean; created_at:string;
};
const KEY='supertech-independent-super-signal-records-v1';
function toRow(signal:SuperSignal):SuperSignalRecord {
 return {signal_key:`${signal.symbol}|900|${signal.signalEpoch}|${signal.direction}`,symbol:signal.symbol,
 asset_name:signal.name,digits:signal.digits,direction:signal.direction,signal_epoch:signal.signalEpoch,
 entry:signal.levels.entry,stop_loss:signal.levels.stopLoss,tp1:signal.levels.tp1,tp2:signal.levels.tp2,
 tp3:signal.levels.tp3,band_mean:signal.levels.mean,band_deviation:signal.levels.deviation,
 daily_bias:signal.dailyBias,reads:signal.reads,explanation:signal.explanation,grade_percent:signal.gradePercent,
 confirmation_timeframe:signal.confirmationTimeframe,confirmation_epoch:signal.confirmationEpoch,
 status:'Open',tp1_hit_epoch:null,tp2_hit_epoch:null,tp3_hit_epoch:null,sl_hit_epoch:null,closed:false,
 created_at:new Date(signal.signalEpoch*1000).toISOString()};
}
function readRows():SuperSignalRecord[]{try{const value=JSON.parse(localStorage.getItem(KEY)??'[]');return Array.isArray(value)?value as SuperSignalRecord[]:[]}catch{return[]}}
export function useSuperSignalRecords(signals:SuperSignal[],loaded:boolean){
 const [records,setRecords]=useState<SuperSignalRecord[]>(readRows);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const seen=useRef(new Set<string>());
 const [refreshKey,setRefreshKey]=useState(0);
 const refresh=useCallback(()=>setRefreshKey(v=>v+1),[]);
 useEffect(()=>{const timer=window.setInterval(refresh,10000);return()=>window.clearInterval(timer)},[refresh]);
 useEffect(()=>{let active=true;setRecords(readRows());fetchIndependentSuperSignalRecords().then(({records:remote})=>{if(!active)return;const valid=remote.filter((row):row is SuperSignalRecord=>Boolean(row&&typeof row.signal_key==='string'&&typeof row.signal_epoch==='number'));const merged=[...new Map([...valid,...readRows()].map(row=>[row.signal_key,row])).values()].sort((a,b)=>b.signal_epoch-a.signal_epoch).slice(0,300);localStorage.setItem(KEY,JSON.stringify(merged));setRecords(merged);setError(null)}).catch(()=>{if(active)setError('History is saved on this device; cross-device sync is not configured yet')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[refreshKey]);
 useEffect(()=>{
  if(!loaded||!signals.length)return;
  const byKey=new Map(readRows().map(row=>[row.signal_key,row]));
  for(const signal of signals){const row=toRow(signal);if(!seen.current.has(row.signal_key)){seen.current.add(row.signal_key);if(!byKey.has(row.signal_key))byKey.set(row.signal_key,row)}}
  const next=[...byKey.values()].sort((a,b)=>b.signal_epoch-a.signal_epoch).slice(0,300);
  try{localStorage.setItem(KEY,JSON.stringify(next));setRecords(next);setError(null);void (async()=>{for(let i=0;i<next.length;i+=50)await upsertIndependentSuperSignalRecords(next.slice(i,i+50) as unknown as Array<Record<string,unknown>>);})().catch(()=>setError('History is saved on this device; cross-device sync is not configured yet'))}catch{setError('This device could not save signal history')}
 },[signals,loaded]);
 return {records,loading,error,refresh};
}
