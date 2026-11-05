import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';

export type ChatBlockState={blocked_by_me:boolean;blocked_by_other:boolean};
const changedEvent='sharek-chat-blocks-changed';

export function notifyChatBlocksChanged(){window.dispatchEvent(new Event(changedEvent));}

export function useChatBlockState(otherUserId:string|null|undefined){
 const [result,setResult]=useState<{userId:string;state:ChatBlockState}|null>(null);
 const state=result&&result.userId===otherUserId?result.state:null;
 const [loading,setLoading]=useState(true);
 const requestSequence=useRef(0);
 const refresh=useCallback(async()=>{
  const request=++requestSequence.current;
  if(!otherUserId){setResult(null);setLoading(false);return;}
  const {data,error}=await supabase.rpc('get_chat_block_state',{p_other_user_id:otherUserId});
  if(request!==requestSequence.current)return;
  setResult(!error&&data?{userId:otherUserId,state:data as ChatBlockState}:null);
  setLoading(false);
 },[otherUserId]);
 useEffect(()=>{
  let active=true;
  const sequence=requestSequence;
  setResult(null);setLoading(true);
  const update=()=>{if(active)void refresh();};
  update();
  if(!otherUserId)return()=>{active=false;sequence.current++;};
  const channel=supabase.channel(`chat-block-state-${otherUserId}-${crypto.randomUUID()}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'chat_blocked_users'},payload=>{
    const row=(payload.new&&Object.keys(payload.new).length?payload.new:payload.old) as {blocker_id?:string;blocked_id?:string};
    if(row.blocker_id===otherUserId||row.blocked_id===otherUserId)update();
   }).subscribe();
  window.addEventListener(changedEvent,update);
  window.addEventListener('focus',update);
  window.addEventListener('online',update);
  return()=>{active=false;sequence.current++;window.removeEventListener(changedEvent,update);window.removeEventListener('focus',update);window.removeEventListener('online',update);void supabase.removeChannel(channel);};
 },[otherUserId,refresh]);
 return {blockState:state,blockLoading:loading,refreshBlockState:refresh};
}
