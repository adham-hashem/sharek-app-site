import { useCallback,useEffect,useRef,useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { LocationFix,LocationIssue } from './geo';
import { navigationIssue } from './direct-navigation-geo';

// Navigation-only GPS: no reverse geocoding, backend location sharing or storage.
export function useNavigationLocation(enabled:boolean){
 const [fix,setFix]=useState<LocationFix|null>(null),[error,setError]=useState<LocationIssue>('requesting');
 const watch=useRef<number|null>(null),generation=useRef(0);
 const stop=useCallback(()=>{generation.current++;if(watch.current!==null)navigator.geolocation?.clearWatch(watch.current);watch.current=null;setFix(null);},[]);
 const start=useCallback(()=>{
  stop();if(!enabled||document.visibilityState==='hidden')return;setError('requesting');
  if(!navigator.geolocation){setError('unavailable');return;}
  const current=generation.current;
  try{watch.current=navigator.geolocation.watchPosition(position=>{
   if(current!==generation.current)return;
   const next={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
   const issue=navigationIssue(next);setFix(issue?null:next);setError(issue??'requesting');
  },problem=>{if(current===generation.current){setFix(null);setError(problem.code===1?'denied':'unavailable');}}, {enableHighAccuracy:true,maximumAge:0,timeout:12000});}
  catch{setError('unavailable');}
 },[enabled,stop]);
 useEffect(()=>{
  start();const expire=window.setInterval(()=>setFix(value=>{if(value&&navigationIssue(value)){setError('stale');return null;}return value;}),1000);
  const visibility=()=>document.visibilityState==='hidden'?stop():start();document.addEventListener('visibilitychange',visibility);
  const listener=Capacitor.isNativePlatform()?App.addListener('appStateChange',state=>state.isActive?start():stop()):null;
  return()=>{stop();window.clearInterval(expire);document.removeEventListener('visibilitychange',visibility);void listener?.then(handle=>handle.remove());};
 },[start,stop]);
 return {fix,error,retry:start};
}
