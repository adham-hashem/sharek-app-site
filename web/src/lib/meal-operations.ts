import { supabase, type MealRequest } from './supabase';
import { prepareSuccessSound, playSuccessSoundOnce } from './success-sound';
const pending = new Map<string, Promise<{ data: MealRequest | null; error: unknown }>>();
export const MEAL_REQUEST_SAVED='sharek-meal-request-saved';
export const isActiveHandover=(request:MealRequest)=>['ACCEPTED','WAITING_FOR_PICKUP','ON_THE_WAY','ARRIVED'].includes(request.status);
export const isReceived=(request:MealRequest)=>['RECEIVED','COMPLETED'].includes(request.status);
export function publishMealRequestSaved(request:MealRequest){window.dispatchEvent(new CustomEvent(MEAL_REQUEST_SAVED,{detail:request}));}
export function mergeRequestSnapshot(previous:MealRequest[],incoming:MealRequest[]){const saved=new Map(previous.filter(isReceived).map(row=>[row.id,row]));return incoming.map(row=>saved.has(row.id)&&isActiveHandover(row)?saved.get(row.id)!:row);}
export function advanceMealRequest(request: MealRequest, nextStatus: MealRequest['status'], actingUserId: string, navigation?: { latitude?:number; longitude?:number; accuracy?:number; timestamp?:number }) {
  const key = `${request.id}:${nextStatus}`;
  const existing = pending.get(key); if (existing) return existing;
  if (request.status === nextStatus && nextStatus!=='RECEIVED') return Promise.resolve({ data: request, error: null });
  if (nextStatus === 'RECEIVED' && actingUserId === request.requester_id) prepareSuccessSound();
  const operation = (async () => {
    if(nextStatus==='RECEIVED'&&isReceived(request)){
      const saved=await supabase.from('meal_requests').select('*').eq('id',request.id).maybeSingle();
      const row=saved.data as MealRequest|null;
      if(saved.error||!row||row.id!==request.id||row.requester_id!==request.requester_id||row.pickup_meal_id!==request.pickup_meal_id||!isReceived(row))return {data:null,error:saved.error??new Error('REQUEST_NOT_CONFIRMED')};
      publishMealRequestSaved(row);return {data:row,error:null};
    }
    const { data, error } = await supabase.rpc(navigation ? 'advance_direct_navigation' : 'advance_meal_request', { p_request_id: request.id, p_next_status: nextStatus,
      ...(navigation ? { p_latitude:navigation.latitude??null,p_longitude:navigation.longitude??null,p_accuracy:navigation.accuracy??null,p_fix_time:navigation.timestamp?new Date(navigation.timestamp).toISOString():null } : {}) });
    let updated = (Array.isArray(data) ? data[0] : data) as MealRequest | null;
    // A prior receipt may have committed even if its acknowledgement was lost.
    if(nextStatus==='RECEIVED'&&(!updated||error)){
      updated=null;
      const saved=await supabase.from('meal_requests').select('*').eq('id',request.id).maybeSingle();
      if(!saved.error&&saved.data&&isReceived(saved.data as MealRequest))updated=saved.data as MealRequest;
    }
    if ((error&&nextStatus!=='RECEIVED') || !updated || updated.id !== request.id || updated.requester_id!==request.requester_id || updated.pickup_meal_id!==request.pickup_meal_id || (nextStatus==='RECEIVED'?!isReceived(updated):updated.status!==nextStatus)) return { data: null, error:error??new Error('REQUEST_NOT_CONFIRMED') };
    publishMealRequestSaved(updated);
    if (nextStatus === 'RECEIVED' && !isReceived(request) && updated.requester_id === actingUserId) void playSuccessSoundOnce('received', updated.id);
    return { data: updated, error: null };
  })().finally(() => pending.delete(key));
  pending.set(key, operation); return operation;
}
