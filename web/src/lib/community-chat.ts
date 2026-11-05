import { supabase } from './supabase';
export type ChatOpenResult = { ok: boolean; message: string };
export async function communityChatTarget(mealId:string,donorId:string,callerId:string) {
 if(!mealId||!donorId||!callerId||donorId===callerId)throw new Error('INVALID_PARTNER');
 const {data:threadId,error}=await supabase.rpc('get_or_create_community_chat',{p_meal_id:mealId});
 if(error||typeof threadId!=='string'||!threadId)throw new Error('CHAT_UNAVAILABLE');
 const {data:thread,error:readError}=await supabase.from('chat_threads').select('id,participant_a,participant_b,request_id').eq('id',threadId).maybeSingle();
 if(readError||!thread)throw new Error('CHAT_UNAVAILABLE');
 const partnerId=thread.participant_a===callerId?thread.participant_b:thread.participant_b===callerId?thread.participant_a:null;
 if(partnerId!==donorId)throw new Error('INVALID_PARTNER');
 return {threadId,partnerId:donorId,requestId:thread.request_id as string|null,requestStatus:null};
}
