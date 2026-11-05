import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, type CommunityMeal } from './supabase';
import { distanceKm, discoveryRange, validCoordinates, nearbyCommunityMeals } from './geo';
export { validCoordinates } from './geo';
const NO_DISTANCES: Record<string, number> = {};

export function useMealDistances(ids: string[], lat: number | null, lng: number | null, version = '') {
 const idsKey=[...ids].sort().join(','),key=`${lat}:${lng}:${idsKey}:${version}`;
 const [snapshot,setSnapshot]=useState<{key:string;values:Record<string,number>}>({key:'',values:{}});
 useEffect(()=>{
  if(!validCoordinates(lat,lng)||!idsKey)return;
  let alive=true;
  const timer=window.setTimeout(()=>{
   void supabase.rpc('get_meal_distances',{p_user_lat:lat,p_user_lng:lng,p_meal_ids:idsKey.split(',')}).then(({data,error})=>{
    if(!alive||error)return;
    const values:Record<string,number>={};
    for(const row of (data??[]) as {id:string;distance_km:number}[])if(Number.isFinite(row.distance_km)&&row.distance_km>=0)values[row.id]=row.distance_km;
    setSnapshot({key,values});
   });
  },250);
  return()=>{alive=false;window.clearTimeout(timer);};
 },[idsKey,key,lat,lng]);
 return validCoordinates(lat,lng)&&snapshot.key===key?snapshot.values:NO_DISTANCES;
}

export function useCommunityMeals(userId:string|undefined,lat:number|null,lng:number|null,enabled=true) {
 const [rows,setRows]=useState<CommunityMeal[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const [now,setNow]=useState(Date.now);
 const latest=useRef({lat,lng});latest.current={lat,lng};
 const fetchedAt=useRef<{lat:number;lng:number}|null>(null);
 const scheduleRef=useRef<()=>void>(()=>{});
 const refreshRef=useRef<()=>void>(()=>{});
 const refresh=useCallback(()=>refreshRef.current(),[]);
 useEffect(()=>{
  if(!userId||!enabled){setRows([]);setLoading(false);return;}
  let alive=true,inFlight=false,dirty=false;
  let timer:number|undefined;
  const fetchMeals=async()=>{
   if(!alive)return;
   const origin=latest.current;
   if(!validCoordinates(origin.lat,origin.lng)){setLoading(false);return;}
   if(inFlight){dirty=true;return;}
   inFlight=true;
   try{
    do{
     dirty=false;const requested=latest.current;
     if(!validCoordinates(requested.lat,requested.lng))break;
     const result=await supabase.rpc('get_community_meals',{p_user_lat:requested.lat,p_user_lng:requested.lng});
     if(!alive)return;
     setError(Boolean(result.error));
     if(!result.error){
      fetchedAt.current={lat:requested.lat!,lng:requested.lng!};
      setRows(current=>{
       const previous=new Map(current.map(row=>[row.id,row]));
       const next=((result.data??[]) as CommunityMeal[]).map(row=>{const old=previous.get(row.id);return old&&JSON.stringify(old)===JSON.stringify(row)?old:row;});
       return next.length===current.length&&next.every((row,i)=>row===current[i])?current:next;
      });
     }
    }while(dirty&&alive);
   }catch{if(alive)setError(true);}
   finally{inFlight=false;if(alive)setLoading(false);}
  };
  const schedule=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>void fetchMeals(),180);};
  scheduleRef.current=schedule;refreshRef.current=()=>{window.clearTimeout(timer);void fetchMeals();};void fetchMeals();
  const channel=supabase.channel(`community-feed-${userId}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'meals'},schedule)
   .on('postgres_changes',{event:'*',schema:'public',table:'meal_photos'},schedule)
   .on('postgres_changes',{event:'*',schema:'public',table:'meal_requests'},schedule)
   .subscribe(status=>{if(status==='SUBSCRIBED')schedule();});
  const foreground=()=>{if(document.visibilityState==='visible')schedule();};
  const reconcile=window.setInterval(schedule,30000),clock=window.setInterval(()=>setNow(Date.now()),1000);
  window.addEventListener('online',schedule);document.addEventListener('visibilitychange',foreground);
  return()=>{alive=false;scheduleRef.current=()=>{};refreshRef.current=()=>{};fetchedAt.current=null;window.clearTimeout(timer);window.clearInterval(reconcile);window.clearInterval(clock);void supabase.removeChannel(channel);window.removeEventListener('online',schedule);document.removeEventListener('visibilitychange',foreground);};
 },[userId,enabled]);
 useEffect(()=>{
  if(!validCoordinates(lat,lng)){fetchedAt.current=null;return;}
  const previous=fetchedAt.current;
  if(!previous||distanceKm(lat!,lng!,previous.lat,previous.lng)>=0.01)scheduleRef.current();
 },[lat,lng]);
 const meals=useMemo(()=>nearbyCommunityMeals(rows,lat,lng,now),[rows,lat,lng,now]);
 const allMeals=useMemo(()=>nearbyCommunityMeals(rows,lat,lng,now,50),[rows,lat,lng,now]);
 return {meals,allMeals,loading,error,refresh,radiusKm:discoveryRange(meals[0]?.distance_km??undefined)};
}

