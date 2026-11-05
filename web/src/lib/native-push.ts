import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import {supabase} from './supabase';
import {createPushController,type DeviceBinding,type NativeAction} from './native-push-core';
export interface NativePushPlugin {
 status():Promise<{configured:boolean;granted:boolean}>;
 requestPermission():Promise<{configured:boolean;granted:boolean}>;
 prepare(options:{userId:string}):Promise<DeviceBinding>;
 registered(options:{bindingId:string;token:string}):Promise<void>;
 preferences(options:{userId:string;settings:Record<string,unknown>}):Promise<void>;
 clear():Promise<void>;
 consumeAction(options:{userId:string}):Promise<{action:NativeAction|null}>;
 openSettings():Promise<void>;
 addListener(event:'tokenChanged'|'notificationReceived'|'notificationAction'|'refreshRequested',callback:()=>void):Promise<PluginListenerHandle>;
}
const bridge=registerPlugin<NativePushPlugin>('NativePush');
// Keep bridge calls behind a plain adapter so lifecycle integration can be exercised without faking FCM delivery.
export const NativePush:NativePushPlugin={status:()=>bridge.status(),requestPermission:()=>bridge.requestPermission(),prepare:options=>bridge.prepare(options),registered:options=>bridge.registered(options),preferences:options=>bridge.preferences(options),clear:()=>bridge.clear(),consumeAction:options=>bridge.consumeAction(options),openSettings:()=>bridge.openSettings(),addListener:(event,callback)=>bridge.addListener(event,callback)};
export const nativePushSupported=()=>Capacitor.getPlatform()==='android';
function bounded<T>(promise:Promise<T>):Promise<T>{let timer:number;return Promise.race([promise,new Promise<never>((_,reject)=>{timer=window.setTimeout(()=>reject(new Error('PUSH_TIMEOUT')),12000);})]).finally(()=>window.clearTimeout(timer));}
const base=import.meta.env.VITE_SUPABASE_URL??import.meta.env.SUPABASE_URL;
const controller=createPushController({
 prepare:userId=>bounded(NativePush.prepare({userId})),
 register:async binding=>{
  const {data:{session}}=await supabase.auth.getSession();if(session?.user.id!==binding.userId)throw new Error('BINDING_CHANGED');
  const timeout=new AbortController(),timer=window.setTimeout(()=>timeout.abort(),12000);
  try{const {data,error}=await supabase.rpc('register_native_push',{p_installation_id:binding.installationId,p_binding_id:binding.bindingId,p_token:binding.token,p_secret:binding.secret,p_platform:'android',p_token_revision:binding.revision}).abortSignal(timeout.signal);if(error)throw error;return data===true;}finally{window.clearTimeout(timer);}
 },
 acknowledge:binding=>NativePush.registered({bindingId:binding.bindingId,token:binding.token}),
 revoke:async binding=>{await fetch(`${base}/functions/v1/push-device`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({installationId:binding.installationId,bindingId:binding.bindingId,secret:binding.secret,disable:true}),signal:AbortSignal.timeout(12000)});},
 clear:()=>NativePush.clear(),
});
export const syncNativePush=(userId:string)=>controller.sync(userId);
export async function detachPush(){
 if(nativePushSupported()){await controller.clear();return;}
 if(!('serviceWorker' in navigator))return;
 const registration=await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL+'firebase-messaging-sw.js'),subscription=await registration?.pushManager.getSubscription();
 if(subscription){const {error}=await supabase.rpc('unregister_notification_token',{p_token:JSON.stringify(subscription.toJSON())});if(!error)await subscription.unsubscribe();}
}
