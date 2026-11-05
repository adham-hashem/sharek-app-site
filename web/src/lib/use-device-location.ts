import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { distanceKm, locationIssue, type LocationFix, type LocationIssue } from './geo';
import { resolveLocationAreaInfo } from './location-area';
import {supabase} from './supabase';
import { hasLocationSettings, LocationSettings,LocationLifecycle } from './location-settings';

export function useDeviceLocation(language: string,userId?:string|null) {
 const [fix,setFix]=useState<LocationFix|null>(null);
 const [error,setError]=useState<LocationIssue|null>('requesting');
 const watch=useRef<number|null>(null),generation=useRef(0);
 const errorTimer=useRef<number|null>(null);
 const stopLocation=useCallback(()=>{
  generation.current++;
  if(errorTimer.current!=null)window.clearTimeout(errorTimer.current);
  errorTimer.current=null;
  if(watch.current!=null)navigator.geolocation?.clearWatch(watch.current);
  watch.current=null;
 },[]);
 const startLocation=useCallback(async(explicit=false)=>{
  stopLocation();const current=generation.current;
  // A fresh fix remains valid while Android resumes its GPS watch; clearing it
  // here made distance labels disappear and reappear on every foreground event.
  setFix(current=>current&&locationIssue(current)?null:current);setError('requesting');
  if(hasLocationSettings()){
   try{
    let state=await LocationSettings.status();if(current!==generation.current)return;
    if(!state.servicesEnabled){setFix(null);setError('services_off');if(explicit)await LocationSettings.openSettings({kind:'location'});return;}
    if(!state.granted){
     let asked=true;try{asked=localStorage.getItem('sharek-location-permission-requested')==='1';}catch{/* Keep location available if optional storage fails. */}
     if(explicit||(!asked&&state.permission==='prompt')){
      if(explicit&&state.permission==='denied'){setFix(null);setError('denied');await LocationSettings.openSettings({kind:'permission'});return;}
      try{localStorage.setItem('sharek-location-permission-requested','1');}catch{/* Keep location available if optional storage fails. */}
      state=await LocationSettings.requestLocationPermission();if(current!==generation.current)return;
     }
     if(!state.granted){setFix(null);setError('denied');return;}
    }
   }catch{if(current===generation.current){setFix(null);setError('unavailable');}return;}
  }else if(navigator.permissions){
   try{const permission=await navigator.permissions.query({name:'geolocation'});if(current!==generation.current)return;
    if(permission.state==='denied'){setFix(null);setError('denied');return;}
   }catch{/* Browsers without the Permissions API use the official geolocation prompt. */}
  }
  if (!navigator.geolocation){setFix(null);setError('unavailable');return;}
  try { watch.current=navigator.geolocation.watchPosition(position=>{
   if(current!==generation.current)return;
   if(errorTimer.current!=null)window.clearTimeout(errorTimer.current);
   errorTimer.current=null;
   const next={latitude:position.coords.latitude,longitude:position.coords.longitude,accuracy:position.coords.accuracy,timestamp:position.timestamp};
   const issue=locationIssue(next);setFix(issue?null:next);setError(issue);
  },problem=>{
   if(current!==generation.current)return;
   const invalidate=()=>{if(current!==generation.current)return;errorTimer.current=null;setFix(null);setError(problem.code===1?'denied':'unavailable');};
   if(errorTimer.current!=null)window.clearTimeout(errorTimer.current);
   // Providers can emit POSITION_UNAVAILABLE immediately before the next fix.
   // Coalesce that handoff; a real outage clears the location within 750ms.
   if(problem.code===1)invalidate();else errorTimer.current=window.setTimeout(invalidate,750);
  },{enableHighAccuracy:true,maximumAge:0,timeout:15000}); } catch { setFix(null);setError('unavailable'); }
 },[stopLocation]);
 const requestLocation=useCallback(()=>{void startLocation(true);},[startLocation]);
 useEffect(()=>{
  void startLocation();
  const expire=window.setInterval(()=>setFix(current=>{
   if(current&&locationIssue(current)){setError('stale');return null;}return current;
  }),5000);
  const foreground=()=>{if(document.visibilityState==='visible')void startLocation();};
  document.addEventListener('visibilitychange',foreground);
  const listener=Capacitor.isNativePlatform()?LocationLifecycle.onResume(state=>{if(state.isActive)void startLocation();}):null;
  const providers=hasLocationSettings()?LocationSettings.addListener('locationServicesChanged',()=>{void startLocation();}):null;
  return()=>{stopLocation();window.clearInterval(expire);document.removeEventListener('visibilitychange',foreground);void listener?.then(handle=>handle.remove());void providers?.then(handle=>handle.remove());};
 },[startLocation,stopLocation]);
 const storageKey=`sharek-user-area:${userId??'guest'}:${language}`;
 const readSaved=()=>{try{return JSON.parse(localStorage.getItem(storageKey)??'null') as {name:string;latitude:number;longitude:number;at:number}|null;}catch{return null;}};
 const [area,setArea]=useState(readSaved);
 useEffect(()=>{const cached=readSaved();setArea(cached);if(!userId)return;let active=true,loading=false;const refresh=()=>{if(loading||document.hidden)return;loading=true;void supabase.rpc('get_my_location_area',{p_language:language}).then(({data,error:issue})=>{if(active&&!issue&&data?.name){setArea(current=>{if(current&&current.at>=data.at)return current;try{localStorage.setItem(storageKey,JSON.stringify(data));}catch{/* Keep location available if optional storage fails. */}return data;});}}).then(()=>{loading=false;},()=>{loading=false;});};refresh();window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);const native=Capacitor.isNativePlatform()?LocationLifecycle.onResume(s=>{if(s.isActive)refresh();}):null;return()=>{active=false;window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);void native?.then(listener=>listener.remove());};},[storageKey,userId,language]);
 const lastLookup=useRef<{latitude:number;longitude:number;language:string}|null>(null);
 const syncAt=useRef(0);
 const areaCell=fix?`${fix.latitude.toFixed(3)}:${fix.longitude.toFixed(3)}`:'';
 useEffect(()=>{
  if(!fix||locationIssue(fix))return;
  const previous=lastLookup.current??(area?{...area,language}:null);
  if(previous&&previous.language===language&&distanceKm(previous.latitude,previous.longitude,fix.latitude,fix.longitude)<0.25)return;
  let active=true;
  const timer=window.setTimeout(()=>{
   void resolveLocationAreaInfo(fix.latitude,fix.longitude,language).then(async info=>{
    if(!active||!info.name)return;
    const saved={name:info.name,latitude:fix.latitude,longitude:fix.longitude,at:fix.timestamp};
    setArea(saved);lastLookup.current={...fix,language};
    try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{/* Keep location available if optional storage fails. */}
   }).catch(()=>{});
  },Math.max(0,syncAt.current+3000-Date.now()));syncAt.current=Date.now();
  return()=>{active=false;window.clearTimeout(timer);};
 },[areaCell,storageKey,language,userId,area?.name]);
 const areaSaved=useRef<{at:number;latitude:number;longitude:number;userId:string;language:string}|null>(null),savingArea=useRef(false);
 useEffect(()=>{
  let active=true;const save=async()=>{if(!active||!userId||!fix||locationIssue(fix)||!area||!navigator.onLine||savingArea.current||distanceKm(area.latitude,area.longitude,fix.latitude,fix.longitude)>0.25)return;const previous=areaSaved.current;if(previous&&previous.userId===userId&&previous.language===language&&Date.now()-previous.at<60000&&distanceKm(previous.latitude,previous.longitude,fix.latitude,fix.longitude)<0.05)return;savingArea.current=true;try{const info=await resolveLocationAreaInfo(fix.latitude,fix.longitude,language);if(!active||!info.name)return;const {error:issue}=await supabase.rpc('save_user_location_area',{p_latitude:fix.latitude,p_longitude:fix.longitude,p_accuracy:fix.accuracy,p_observed_at:new Date(fix.timestamp).toISOString(),p_language:language,p_details:info});if(!issue)areaSaved.current={...fix,at:Date.now(),userId,language};}finally{savingArea.current=false;}};
  const retry=()=>void save().catch(()=>{});retry();window.addEventListener('online',retry);return()=>{active=false;window.removeEventListener('online',retry);};
 },[fix?.timestamp,area?.name,userId,language]);
 return {fix,userLat:fix?.latitude??null,userLng:fix?.longitude??null,accuracy:fix?.accuracy??null,error,areaName:area?.name??null,requestLocation};
}
