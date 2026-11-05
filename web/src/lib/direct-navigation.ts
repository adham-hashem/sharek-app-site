import { supabase } from './supabase';
import { validCoordinates,type LocationFix } from './geo';
import { navigationIssue,type WalkingRoute } from './direct-navigation-geo';
export type NavigationTarget={request_id:string;meal_id:string;latitude:number;longitude:number;deadline:string;status:'WAITING_FOR_PICKUP'|'ON_THE_WAY'|'ARRIVED';instructions:string|null;version:string};
export class NavigationFailure extends Error {code:string;retryAfterMs:number;constructor(code:string,retryAfterMs=8000){super(code);this.code=code;this.retryAfterMs=retryAfterMs;}}
export function validTarget(value:unknown,requestId:string):value is NavigationTarget {
 const target=value as NavigationTarget|null;
 return Boolean(target&&target.request_id===requestId&&typeof target.meal_id==='string'&&validCoordinates(target.latitude,target.longitude)&&Date.parse(target.deadline)>Date.now()&&['WAITING_FOR_PICKUP','ON_THE_WAY','ARRIVED'].includes(target.status)&&typeof target.version==='string');
}
export async function getNavigationTarget(requestId:string){
 const {data,error}=await supabase.rpc('get_direct_navigation_target',{p_request_id:requestId});
 if(error)throw new NavigationFailure('RESERVATION_CHECK_FAILED');
 if(!validTarget(data,requestId))throw new NavigationFailure('RESERVATION_UNAVAILABLE');
 return data;
}
export async function getWalkingRoute(requestId:string,fix:LocationFix,signal:AbortSignal):Promise<{target:NavigationTarget;route:WalkingRoute}>{
 if(navigationIssue(fix))throw new NavigationFailure('GPS_UNRELIABLE');
 const {data:{session}}=await supabase.auth.getSession();if(signal.aborted)throw new DOMException('Aborted','AbortError');
 if(!session)throw new NavigationFailure('UNAUTHORIZED');
 const url=import.meta.env.VITE_SUPABASE_URL??import.meta.env.SUPABASE_URL;
 const key=import.meta.env.VITE_SUPABASE_ANON_KEY??import.meta.env.SUPABASE_ANON_KEY;
 const bounded=new AbortController(),abort=()=>bounded.abort();signal.addEventListener('abort',abort,{once:true});const timeout=window.setTimeout(abort,20000);
 let response:Response;
 try{response=await fetch(`${url}/functions/v1/direct-pickup-route`,{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({requestId,...fix}),signal:bounded.signal,cache:'no-store'});}
 finally{window.clearTimeout(timeout);signal.removeEventListener('abort',abort);}
 const data=await response.json();if(!response.ok)throw new NavigationFailure(data.code??'ROUTE_UNAVAILABLE',Number(data.retryAfterMs)||8000);
 if(!validTarget(data.target,requestId)||!Array.isArray(data.route?.points)||data.route.points.length<2||data.route.points.some((p:number[])=>!validCoordinates(p[0],p[1]))||!Number.isFinite(data.route.distance)||!Number.isFinite(data.route.duration))throw new NavigationFailure('ROUTE_UNAVAILABLE');
 return data;
}
