import {syncAppUpdatePreferences} from './app-update-preferences';
import {useCallback,useEffect,useRef,useState} from 'react';
import {App} from '@capacitor/app';
import type {PluginListenerHandle} from '@capacitor/core';
import {supabase} from './supabase';
import {NativePush,nativePushSupported,syncNativePush} from './native-push';
import {validNativeAction,type NativeAction,type NativePushState} from './native-push-core';
export function useNativePush(userId:string|null,onAction:(action:NativeAction)=>void,onRefresh:()=>void){
 const [state,setState]=useState<NativePushState>('unavailable'),[granted,setGranted]=useState(false);
 const callbacks=useRef({onAction,onRefresh});callbacks.current={onAction,onRefresh};const syncRef=useRef<()=>Promise<void>>(async()=>{}),actionRef=useRef<()=>Promise<void>>(async()=>{});
 useEffect(()=>{
  if(!nativePushSupported()||!userId)return;
  let active=true,running:Promise<void>|null=null,dirty=false;const handles:Promise<PluginListenerHandle>[]=[],seenActions=new Set<string>();
  const action=async()=>{const {action}=await NativePush.consumeAction({userId});if(active&&validNativeAction(action,userId)&&!seenActions.has(action.notification_id)){seenActions.add(action.notification_id);callbacks.current.onAction(action);}};actionRef.current=action;
  const preferences=async()=>{const {data,error}=await supabase.from('notification_settings').select('*').eq('user_id',userId).maybeSingle();if(!error&&data&&active)await NativePush.preferences({userId,settings:data});await syncAppUpdatePreferences().catch(()=>{});};
  const sync=():Promise<void>=>{
   if(running){dirty=true;return running;}running=(async()=>{do{dirty=false;if(!active)return;
    const status=await NativePush.status();if(!active)return;setGranted(status.granted);
    if(!status.configured){setState('not-configured');return;}
    if(!status.granted){setState('permission-denied');await NativePush.clear();return;}
    if(!navigator.onLine){setState('offline');return;}setState('registering');await syncNativePush(userId);if(!active)return;await preferences();setState('registered');await action();
   }while(dirty&&active);})().catch(()=>{if(active)setState(navigator.onLine?'error':'offline');}).finally(()=>{running=null;if(dirty&&active){dirty=false;void sync();}});return running;
  };syncRef.current=sync;
  handles.push(NativePush.addListener('tokenChanged',()=>void sync()));
  handles.push(NativePush.addListener('notificationAction',()=>void action().catch(()=>{})));
  handles.push(NativePush.addListener('notificationReceived',()=>callbacks.current.onRefresh()));
  handles.push(NativePush.addListener('refreshRequested',()=>callbacks.current.onRefresh()));
  handles.push(App.addListener('appStateChange',({isActive})=>{if(isActive){void sync();void action().catch(()=>{});}}));
  const foreground=()=>{if(!document.hidden){void sync();void action().catch(()=>{});}};
  const settings=()=>void preferences();window.addEventListener('online',foreground);document.addEventListener('visibilitychange',foreground);window.addEventListener('sharek-notification-settings',settings);window.addEventListener('sharek-update-preference',settings);
  const channel=supabase.channel(`native-push-settings-${userId}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'notification_settings',filter:`user_id=eq.${userId}`},settings).subscribe();
  void sync();void action().catch(()=>{});const retry=window.setInterval(()=>{if(!document.hidden&&navigator.onLine)void sync();},60000);
  return()=>{active=false;window.clearInterval(retry);window.removeEventListener('online',foreground);document.removeEventListener('visibilitychange',foreground);window.removeEventListener('sharek-notification-settings',settings);window.removeEventListener('sharek-update-preference',settings);handles.forEach(handle=>void handle.then(h=>h.remove()).catch(()=>{}));void supabase.removeChannel(channel);};
 },[userId]);
 const requestPermission=useCallback(async()=>{
  try{
  const current=await NativePush.status();if(!current.configured){setState('not-configured');return;}
  const result=await NativePush.requestPermission();setGranted(result.granted);if(!result.granted){setState('permission-denied');return;}await syncRef.current();await actionRef.current().catch(()=>{});
  }catch{setState(navigator.onLine?'error':'offline');}
 },[]);
 return {state,granted,requestPermission};
}
