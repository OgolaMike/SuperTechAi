import type { Asset, TfState } from '@/lib/sma';
import type { SignalView } from '@/lib/signals';
import type { StopOrderIdea } from '@/lib/stopOrders';
import type { SuperSignal } from '@/lib/intelligence';
import { buildBreakRetestSetups } from '@/lib/breakRetest';
import { buildMarketStructureSarSignal } from '@/lib/marketStructureSar';
import { evaluateThreeHourWick } from '@/lib/threeHourWick';
import type { StrategyAssessment } from '@/lib/strategyConfluence';

export function buildIndependentStrategyAssessments(
 assets:Asset[],states:Record<string,Record<number,TfState>>,signals:SignalView[],
 pending:StopOrderIdea[],superSignals:SuperSignal[],nowEpoch:number,
):StrategyAssessment[]{
 const rows:StrategyAssessment[]=[];
 const latestSignalByAsset=new Map<string,SignalView>();
 for(const item of signals){const current=latestSignalByAsset.get(item.symbol);if(!current||item.signal.signalEpoch>current.signal.signalEpoch)latestSignalByAsset.set(item.symbol,item)}
 for(const item of latestSignalByAsset.values())rows.push({strategyId:'bollinger-cross',strategyName:'Bollinger Candle-Close',symbol:item.symbol,direction:item.signal.direction,status:nowEpoch-item.signal.signalEpoch<=item.granularity*2?'SIGNAL':'STALE',signalEpoch:item.signal.signalEpoch,strength:76,reason:`Confirmed ${item.timeframe} candle-close cross`});
 for(const setup of buildBreakRetestSetups(assets,states))rows.push({strategyId:'break-retest',strategyName:'Break & Retest',symbol:setup.symbol,direction:setup.direction,status:'SIGNAL',signalEpoch:setup.confirmationEpoch,strength:82,reason:'Break, retest and confirmation candle closed'});
 for(const asset of assets){const sar=buildMarketStructureSarSignal(asset.symbol,states[asset.symbol]?.[1800]?.candles??[],nowEpoch);if(sar)rows.push({strategyId:'market-structure-sar',strategyName:'Market Structure SAR',symbol:asset.symbol,direction:sar.direction,status:'SIGNAL',signalEpoch:sar.signalEpoch,strength:80,reason:`Confirmed ${sar.structure} with SAR flip`})}
 for(const idea of pending){if(idea.status==='INVALIDATED'||idea.status==='EXPIRED')continue;rows.push({strategyId:idea.patternType==='TRIPLE TOP'?'triple-top':'triple-bottom',strategyName:idea.patternType==='TRIPLE TOP'?'Triple Top':'Triple Bottom',symbol:idea.symbol,direction:idea.direction,status:'SIGNAL',signalEpoch:idea.signalEpoch,strength:72,reason:'Three-test support/resistance limit setup'})}
 for(const asset of assets){const unified=superSignals.find(s=>s.symbol===asset.symbol);const wick=evaluateThreeHourWick(asset.symbol,states[asset.symbol]?.[14400]?.candles??[],nowEpoch,unified?{symbol:unified.symbol,direction:unified.direction,signalEpoch:unified.signalEpoch}:null);if(wick.status==='CONFIRMED')rows.push({strategyId:'three-hour-wick',strategyName:'3H Wick Intelligence',symbol:asset.symbol,direction:wick.candidate.direction,status:'SIGNAL',signalEpoch:wick.candidate.signalEpoch,strength:78,reason:'H4 wick rejection confirmed by fresh Super Signal'})}
 return rows;
}
