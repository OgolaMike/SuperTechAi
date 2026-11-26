import { useEffect, useState } from 'react';
import type { SignalView } from '@/lib/signals';
import { toRecordRow, upsertSignalRecords } from '@/lib/signalRecords';
export type SyncState={error:string|null;version:number};
export function useSignalRecordSync(views:SignalView[],loaded:boolean):SyncState{
 const [state,setState]=useState<SyncState>({error:null,version:0});
 useEffect(()=>{if(!loaded)return;let cancelled=false;
  void upsertSignalRecords(views.map(toRecordRow)).then(()=>{if(!cancelled)setState(p=>({error:null,version:p.version+1}))}).catch((cause:unknown)=>{if(!cancelled)setState(p=>({error:cause instanceof Error?cause.message:'Could not save signal history',version:p.version+1}))});
  return()=>{cancelled=true};
 },[views,loaded]);
 return state;
}
