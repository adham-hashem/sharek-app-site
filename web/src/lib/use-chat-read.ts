import {useEffect,useRef,type RefObject} from 'react';
import {App} from '@capacitor/app';
import {Capacitor} from '@capacitor/core';
import {supabase,type ChatMessage} from './supabase';

type ReadReceipt=Pick<ChatMessage,'id'|'read_at'|'status'>;
type ReadContext={
 threadId:string;userId:string;active:boolean;pending:Set<string>;acknowledged:Set<string>;
 schedule:(delay?:number,restart?:boolean)=>void;flush:()=>Promise<void>;dispose:()=>void;
};

export function useChatRead(container:RefObject<HTMLDivElement>,threadId:string|null,userId:string,messages:ChatMessage[],confirmed:(rows:ReadReceipt[])=>void,failed:()=>void,enabled=true){
 const contextRef=useRef<ReadContext|null>(null),scanRef=useRef(()=>{});
 const viewRef=useRef({messages,confirmed,failed,enabled});
 viewRef.current={messages,confirmed,failed,enabled};
 const nativeActive=useRef(!Capacitor.isNativePlatform());

 // Track app visibility independently of message renders and dialogs.
 useEffect(()=>{
  let alive=true,revision=0;
  const wake=()=>{scanRef.current();contextRef.current?.schedule(0,true);};
  const visibility=()=>{if(!document.hidden&&nativeActive.current)wake();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('online',wake);
  let listener:ReturnType<typeof App.addListener>|null=null;
  if(Capacitor.isNativePlatform()){
   listener=App.addListener('appStateChange',state=>{revision++;nativeActive.current=state.isActive;if(state.isActive)wake();});
   const initialRevision=revision;
   void App.getState().then(state=>{if(alive&&revision===initialRevision){nativeActive.current=state.isActive;if(state.isActive)wake();}}).catch(()=>{});
  }
  return()=>{alive=false;document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',wake);void listener?.then(handle=>handle.remove()).catch(()=>{});};
 },[]);

 // Preserve the pending queue and acknowledgement across message refreshes.
 useEffect(()=>{
  if(!threadId||!userId)return;
  let timer:number|undefined,running=false;
  const clear=()=>{window.clearTimeout(timer);timer=undefined;};
  const context:ReadContext={threadId,userId,active:true,pending:new Set(),acknowledged:new Set(),
   schedule:(delay=120,restart=false)=>{if(!context.active||!context.pending.size)return;if(restart)clear();if(timer===undefined&&!running)timer=window.setTimeout(()=>{timer=undefined;void context.flush();},delay);},
   flush:async()=>{
    if(running||!context.pending.size)return;
    clear();running=true;const ids=[...context.pending].slice(0,200);let successful=false;
    try{
     const {data,error}=await supabase.rpc('mark_chat_messages_seen',{p_thread_id:threadId,p_message_ids:ids});
     if(error)throw error;
     const requested=new Set(ids);
     const rows=((data??[]) as ReadReceipt[]).filter(row=>requested.has(row.id)&&row.read_at&&row.status==='read');
     for(const row of rows){context.pending.delete(row.id);context.acknowledged.add(row.id);}
     if(rows.length){
      if(context.active&&contextRef.current===context)viewRef.current.confirmed(rows);
      // The list still needs the acknowledgement if the chat has already closed.
      window.dispatchEvent(new CustomEvent('sharek-chat-read',{detail:{threadId,userId,messageIds:rows.map(row=>row.id)}}));
     }
     if(rows.length!==ids.length)throw new Error('CHAT_READ_UNCONFIRMED');
     successful=true;
    }catch{if(context.active&&contextRef.current===context)viewRef.current.failed();}
    finally{
     running=false;
     if(context.active)context.schedule(successful?0:5000);
     else if(successful&&context.pending.size)void context.flush();
    }
   },
   dispose:()=>{context.active=false;clear();void context.flush();},
  };
  contextRef.current=context;
  return()=>{context.dispose();if(contextRef.current===context)contextRef.current=null;};
 },[threadId,userId]);

 useEffect(()=>{
  const root=container.current,context=contextRef.current;
  if(!root||!context||context.threadId!==threadId||context.userId!==userId||!enabled)return;
  const scan=()=>{
   if(!context.active||!viewRef.current.enabled||document.hidden||!nativeActive.current)return;
   const eligible=new Map(viewRef.current.messages.filter(message=>message.thread_id===threadId&&message.sender_id!==userId&&!message.read_at&&message.status!=='sending'&&message.message_type!=='system'&&!message.deleted_for_everyone&&!message.deleted_by.includes(userId)).map(message=>[message.id,message]));
   for(const id of context.pending)if(!eligible.has(id))context.pending.delete(id);
   const bounds=root.getBoundingClientRect();if(bounds.width<=0||bounds.height<=0)return;
   for(const element of root.querySelectorAll<HTMLElement>('[data-message-id]')){
    const id=element.dataset.messageId!,message=eligible.get(id);
    if(!message||context.acknowledged.has(id))continue;
    const image=element.querySelector<HTMLImageElement>('img.chat-image-msg');
    if(message.message_type==='image'&&(!image||!image.complete||!image.naturalWidth))continue;
    const rect=element.getBoundingClientRect();
    if(rect.bottom>Math.max(bounds.top,0)+8&&rect.top<Math.min(bounds.bottom,innerHeight)-8&&rect.right>Math.max(bounds.left,0)&&rect.left<Math.min(bounds.right,innerWidth))context.pending.add(id);
   }
   context.schedule();
  };
  scanRef.current=scan;
  const observer=typeof IntersectionObserver==='undefined'?null:new IntersectionObserver(scan,{root,threshold:[0,0.1,0.5,1]});
  root.querySelectorAll('[data-message-id]').forEach(element=>observer?.observe(element));
  root.addEventListener('scroll',scan,{passive:true});root.addEventListener('load',scan,true);window.addEventListener('resize',scan);scan();
  return()=>{observer?.disconnect();root.removeEventListener('scroll',scan);root.removeEventListener('load',scan,true);window.removeEventListener('resize',scan);if(scanRef.current===scan)scanRef.current=()=>{};};
 },[container,threadId,userId,messages,enabled]);
}
