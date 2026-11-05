import { useEffect,useMemo,useRef,useState } from 'react';
import { Check,LocateFixed,MapPin,Minus,Navigation,Plus,RefreshCw,X } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase,formatDistance,type Language,type MealRequest } from '@/lib/supabase';
import { distanceKm,locationMessage,type LocationFix } from '@/lib/geo';
import { navigationIssue,roadProgress,maneuverText,type WalkingRoute } from '@/lib/direct-navigation-geo';
import { getNavigationTarget,getWalkingRoute,NavigationFailure,type NavigationTarget } from '@/lib/direct-navigation';
import { useNavigationLocation } from '@/lib/use-navigation-location';
import { advanceMealRequest } from '@/lib/meal-operations';

type Props={language:Language;request:MealRequest;profileId:string;onClose:()=>void};
const eligible=(r:MealRequest,id:string)=>r.sharing_mode==='direct'&&r.requester_id===id&&['WAITING_FOR_PICKUP','ON_THE_WAY','ARRIVED'].includes(r.status)&&Date.parse(r.expires_at)>Date.now();
const icon=(user:boolean)=>L.divIcon({className:user?'live-nav-user-icon':'live-nav-pickup-icon',html:user?'<span class="live-nav-user-dot"></span>':'<span class="live-nav-pickup-pin">📍</span>',iconSize:user?[28,28]:[40,48],iconAnchor:user?[14,14]:[20,45]});

export function DirectPickupNavigation({language,request,profileId,onClose}:Props){
 const ar=language==='ar';
 const node=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),userMarker=useRef<L.Marker|null>(null),pickupMarker=useRef<L.Marker|null>(null),accuracyCircle=useRef<L.Circle|null>(null),line=useRef<L.Polyline|null>(null);
 const [target,setTarget]=useState<NavigationTarget|null>(null),[verified,setVerified]=useState(false),[blocked,setBlocked]=useState(''),[online,setOnline]=useState(navigator.onLine),[done,setDone]=useState(false);
 const [follow,setFollow]=useState(true),[route,setRoute]=useState<WalkingRoute|null>(null),[routing,setRouting]=useState(false),[routeError,setRouteError]=useState(''),[pointChanged,setPointChanged]=useState(false),[tileError,setTileError]=useState(false);
 const [busy,setBusy]=useState(false),[actionError,setActionError]=useState(''),[confirmReceipt,setConfirmReceipt]=useState(false);
 const backAction=useRef(onClose);backAction.current=confirmReceipt?()=>setConfirmReceipt(false):onClose;
 useEffect(()=>{const back=(event:Event)=>{event.preventDefault();backAction.current();};window.addEventListener('sharek-navigation-back',back);return()=>window.removeEventListener('sharek-navigation-back',back);},[]);
 const alive=useRef(true),followRef=useRef(true),latestRequest=useRef(request),targetRef=useRef(target),fixRef=useRef<LocationFix|null>(null),routeRef=useRef(route),verifiedRef=useRef(false),onlineRef=useRef(online),doneRef=useRef(done);
 const controller=useRef<AbortController|null>(null),lastRouteAt=useRef(0),retryAt=useRef(0),epoch=useRef(0),busyRef=useRef(false),verifyRef=useRef<()=>void>(()=>{}),started=useRef(false);
 const routeOrigin=useRef<LocationFix|null>(null);
 const inputRequest=useRef(request);inputRequest.current=request;
 const offRoad=(road:WalkingRoute,fix:LocationFix)=>{const p=roadProgress(road,fix.latitude,fix.longitude);const origin=routeOrigin.current;
  // A routing service may snap the starting GPS point to a nearby walkable road.
  // Permit that known offset only while still at the requested origin, without drawing a connector.
  const initial=origin&&p.index===0&&distanceKm(origin.latitude,origin.longitude,fix.latitude,fix.longitude)*1000<=Math.max(10,fix.accuracy);
  return p.offRouteMeters>Math.max(35,fix.accuracy*1.5,initial?road.startOffset+fix.accuracy:0);};
 targetRef.current=target;routeRef.current=route;verifiedRef.current=verified;onlineRef.current=online;doneRef.current=done;
 const location=useNavigationLocation(verified&&online&&!done);fixRef.current=location.fix;
 const clearRoute=()=>{epoch.current++;controller.current?.abort();controller.current=null;routeRef.current=null;lastRouteAt.current=0;setRoute(null);setRouting(false);setRouteError('');line.current?.remove();line.current=null;};

 useEffect(()=>{
  alive.current=true;const instance=L.map(node.current!,{zoomControl:false,attributionControl:true}).fitWorld();map.current=instance;
  const tiles=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://routing.openstreetmap.de/about.html">FOSSGIS/OSRM</a> · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>'}).addTo(instance);
  tiles.on('tileerror',()=>setTileError(true));tiles.on('tileload',()=>setTileError(false));
  instance.on('dragstart zoomstart',(event:L.LeafletEvent)=>{if(event.type==='dragstart'||(event as L.LeafletEvent&{originalEvent?:Event}).originalEvent){followRef.current=false;setFollow(false);}});
  const resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(node.current!);
  return()=>{alive.current=false;epoch.current++;controller.current?.abort();resize.disconnect();instance.remove();map.current=null;userMarker.current=null;pickupMarker.current=null;accuracyCircle.current=null;line.current=null;};
 },[]);

 useEffect(()=>{
  if(done){verifyRef.current=()=>{};return;}
  let active=true,inFlight=false,dirty=false;let scheduled:number|undefined;
  const verify=async()=>{
   if(!active)return;if(inFlight){dirty=true;return;}
   if(!navigator.onLine){setVerified(false);setBlocked('OFFLINE');return;}
   const request=inputRequest.current;
   if(!eligible(request,profileId)){setVerified(false);setBlocked('RESERVATION_UNAVAILABLE');clearRoute();return;}
   inFlight=true;
   try{
    const next=await getNavigationTarget(request.id);if(!active)return;
    if(!started.current&&next.status==='WAITING_FOR_PICKUP'){
     const result=await advanceMealRequest({...request,status:next.status},'ON_THE_WAY',profileId,{});
     if(result.error||!result.data)throw new NavigationFailure('RESERVATION_CHECK_FAILED');
     if(!active)return;next.status='ON_THE_WAY';
    }
    started.current=true;
    const previous=targetRef.current;
    if(previous&&previous.version!==next.version){clearRoute();retryAt.current=0;lastRouteAt.current=0;setPointChanged(true);}
    targetRef.current=next;setTarget(next);latestRequest.current={...request,status:next.status};setVerified(true);setBlocked('');
   }catch(error){if(active){setVerified(false);setBlocked(error instanceof NavigationFailure?error.code:'RESERVATION_CHECK_FAILED');clearRoute();}}
   finally{inFlight=false;if(active&&dirty){dirty=false;void verify();}}
  };
  const schedule=()=>{window.clearTimeout(scheduled);scheduled=window.setTimeout(()=>void verify(),180);};verifyRef.current=()=>void verify();void verify();
  const channel=supabase.channel(`direct-navigation-${request.id}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'meal_requests',filter:`id=eq.${request.id}`},schedule)
   .on('postgres_changes',{event:'*',schema:'public',table:'meals',filter:`id=eq.${request.pickup_meal_id}`},schedule).subscribe();
  const poll=window.setInterval(()=>void verify(),15000);
  const connectivity=()=>{setOnline(navigator.onLine);if(!navigator.onLine){setVerified(false);setBlocked('OFFLINE');clearRoute();}else void verify();};
  const foreground=()=>{if(document.visibilityState==='hidden'){setVerified(false);clearRoute();}else void verify();};
  window.addEventListener('online',connectivity);window.addEventListener('offline',connectivity);document.addEventListener('visibilitychange',foreground);
  return()=>{active=false;window.clearInterval(poll);window.clearTimeout(scheduled);void supabase.removeChannel(channel);window.removeEventListener('online',connectivity);window.removeEventListener('offline',connectivity);document.removeEventListener('visibilitychange',foreground);};
 },[request.id,request.pickup_meal_id,request.sharing_mode,request.requester_id,request.expires_at,request.status,profileId,done]);

 useEffect(()=>{
  const target=targetRef.current;
  if(!target||!map.current)return;
  if(!pickupMarker.current)pickupMarker.current=L.marker([target.latitude,target.longitude],{icon:icon(false),zIndexOffset:500}).addTo(map.current);
  else pickupMarker.current.setLatLng([target.latitude,target.longitude]);
  if(!fixRef.current)map.current.setView([target.latitude,target.longitude],17);
 },[target?.latitude,target?.longitude]);

 useEffect(()=>{
  const instance=map.current,fix=location.fix;
  if(!instance)return;
  if(!fix){userMarker.current?.remove();userMarker.current=null;accuracyCircle.current?.remove();accuracyCircle.current=null;clearRoute();return;}
  if(!userMarker.current)userMarker.current=L.marker([fix.latitude,fix.longitude],{icon:icon(true),zIndexOffset:1000}).addTo(instance);
  else userMarker.current.setLatLng([fix.latitude,fix.longitude]);
  if(!accuracyCircle.current)accuracyCircle.current=L.circle([fix.latitude,fix.longitude],{radius:fix.accuracy,color:'#2563eb',weight:1,fillOpacity:.06}).addTo(instance);
  else accuracyCircle.current.setLatLng([fix.latitude,fix.longitude]).setRadius(fix.accuracy);
  if(followRef.current)instance.panTo([fix.latitude,fix.longitude],{animate:false});
 },[location.fix]);

 const runRoute=useRef<()=>void>(()=>{});
 runRoute.current=()=>{
  const fix=fixRef.current,current=targetRef.current;
  if(!alive.current||doneRef.current||!verifiedRef.current||!onlineRef.current||!fix||navigationIssue(fix)||!current||Date.parse(current.deadline)<=Date.now()||controller.current||Date.now()<retryAt.current)return;
  const currentRoute=routeRef.current,progress=currentRoute?roadProgress(currentRoute,fix.latitude,fix.longitude):null;
  if(currentRoute&&progress&&!offRoad(currentRoute,fix))return;
  if(Date.now()-lastRouteAt.current<8000)return;
  const abort=new AbortController(),currentEpoch=epoch.current;controller.current=abort;lastRouteAt.current=Date.now();setRouting(true);setRouteError('');
  void getWalkingRoute(request.id,fix,abort.signal).then(result=>{
   if(!alive.current||abort.signal.aborted||currentEpoch!==epoch.current||targetRef.current?.version!==result.target.version||!fixRef.current||navigationIssue(fixRef.current))return;
   if(distanceKm(fix.latitude,fix.longitude,fixRef.current.latitude,fixRef.current.longitude)*1000>50){retryAt.current=Date.now()+1300;lastRouteAt.current=0;return;}
   routeOrigin.current=fix;routeRef.current=result.route;setRoute(result.route);retryAt.current=0;
   if(map.current&&followRef.current&&!currentRoute)map.current.fitBounds(L.latLngBounds(result.route.points),{padding:[24,24],maxZoom:17,animate:false});
  }).catch(error=>{
   if(!alive.current||abort.signal.aborted||currentEpoch!==epoch.current)return;
   const failure=error instanceof NavigationFailure?error:new NavigationFailure('ROUTE_UNAVAILABLE');
   setRouteError(failure.code);retryAt.current=Date.now()+Math.max(1300,failure.retryAfterMs);
   if(['RESERVATION_UNAVAILABLE','UNAUTHORIZED','PICKUP_CHANGED'].includes(failure.code))verifyRef.current();
  }).finally(()=>{if(controller.current===abort)controller.current=null;if(alive.current&&currentEpoch===epoch.current)setRouting(false);});
 };
 useEffect(()=>{
  const timer=window.setInterval(()=>{
   const current=targetRef.current;
   if(current&&Date.parse(current.deadline)<=Date.now()&&!doneRef.current){setVerified(false);setBlocked('RESERVATION_UNAVAILABLE');clearRoute();return;}
   runRoute.current();
  },1000);runRoute.current();return()=>window.clearInterval(timer);
 },[]);

 const progress=useMemo(()=>route&&location.fix?roadProgress(route,location.fix.latitude,location.fix.longitude):null,[route,location.fix]);
 const offRoute=Boolean(route&&location.fix&&offRoad(route,location.fix));
 const metrics=verified&&online&&!offRoute&&!routeError?progress:null;
 const nearby=Boolean(verified&&online&&location.fix&&target&&distanceKm(location.fix.latitude,location.fix.longitude,target.latitude,target.longitude)*1000+location.fix.accuracy<=100);
 useEffect(()=>{
  if(!map.current)return;
  if(!route){line.current?.remove();line.current=null;return;}
  const points=progress&&!offRoute?progress.remainingPoints:route.points;
  if(!line.current)line.current=L.polyline(points,{className:'direct-walking-route',color:'#f06427',weight:6,opacity:offRoute?.35:.9}).addTo(map.current);
  else line.current.setLatLngs(points).setStyle({opacity:offRoute?.35:.9});
 },[route,progress,offRoute]);

 const advance=async(next:'ARRIVED'|'RECEIVED')=>{
  if(busyRef.current||!verified||!online||!target||(next==='ARRIVED'&&!nearby))return;
  busyRef.current=true;setBusy(true);setActionError('');
  try{
   const {data,error}=await advanceMealRequest(latestRequest.current,next,profileId,next==='ARRIVED'?location.fix??{}:{});
   if(error||!data)throw new Error('Could not confirm');
   if(!alive.current)return;latestRequest.current=data;
   if(next==='RECEIVED'){setConfirmReceipt(false);doneRef.current=true;setDone(true);setVerified(false);clearRoute();}
   else{const updated={...targetRef.current!,status:'ARRIVED' as const};targetRef.current=updated;setTarget(updated);}
  }catch{if(alive.current){setActionError(ar?'تعذر تأكيد الخطوة. تحقق من الاتصال وحالة الحجز ثم حاول مرة أخرى.':'Could not confirm. Check your connection and reservation, then retry.');verifyRef.current();}}
  finally{busyRef.current=false;if(alive.current)setBusy(false);}
 };
 const recenter=()=>{followRef.current=true;setFollow(true);if(fixRef.current)map.current?.setView([fixRef.current.latitude,fixRef.current.longitude],17,{animate:false});};
 const retryRoute=()=>{retryAt.current=0;lastRouteAt.current=0;setRouteError('');location.retry();verifyRef.current();};
 const blockedText=blocked==='RESERVATION_UNAVAILABLE'?(ar?'الحجز غير متاح للاستلام أو انتهت مهلته.':'This reservation is unavailable or its pickup deadline has passed.'):blocked==='OFFLINE'?(ar?'انقطع الإنترنت. الملاحة متوقفة حتى يعود الاتصال.':'Offline. Navigation is paused until the connection returns.'):(ar?'جارٍ التحقق من الحجز. لا يمكن متابعة الملاحة قبل تأكيده.':'Checking your reservation. Navigation requires a confirmed booking.');
 return <div className="live-nav-overlay direct-live-nav" dir={ar?'rtl':'ltr'} role="dialog" aria-modal="true" aria-label={ar?'الطريق إلى الوجبة':'Route to the meal'}>
  <header className="live-nav-topbar"><button className="live-nav-close" onClick={onClose} aria-label={ar?'إغلاق الملاحة':'Close navigation'}><X size={20}/></button><div className="live-nav-title"><Navigation size={16}/>{ar?'الطريق إلى الوجبة':'Route to the meal'}</div><div className="live-nav-zoom-controls"><button aria-label={ar?'تكبير':'Zoom in'} onClick={()=>map.current?.zoomIn()}><Plus size={18}/></button><button aria-label={ar?'تصغير':'Zoom out'} onClick={()=>map.current?.zoomOut()}><Minus size={18}/></button></div></header>
  <div className="direct-nav-notices" aria-live="polite">
   {!verified&&!done&&<p role="alert">{blockedText}<button className="text-button" onClick={()=>verifyRef.current()}>{ar?'إعادة التحقق':'Recheck'}</button></p>}
   {verified&&!location.fix&&<p role="alert">{locationMessage(location.error,ar)}<button className="text-button" onClick={location.retry}>{ar?'إعادة تحديد الموقع':'Retry GPS'}</button></p>}
   {tileError&&<p role="alert">{ar?'تعذر تحميل بلاطات الخريطة. تحقق من الإنترنت.':'Map tiles could not load. Check your connection.'}</p>}
   {pointChanged&&<p role="status">{ar?'تغيّرت نقطة الاستلام المعتمدة. تم تحديث الدبوس وإعادة حساب الطريق.':'The approved pickup point changed. The pin and route have been updated.'}</p>}
   {(routing||offRoute)&&<p role="status"><RefreshCw size={14}/>{ar?'جارٍ حساب مسار المشي من موقعك الحالي…':'Calculating a walking route from your current location…'}</p>}
   {routeError&&<p role="alert">{ar?'تعذر الحصول على مسار مشي موثوق. لن يُرسم طريق بديل بخط مستقيم.':'A reliable walking route is unavailable.'}<button className="text-button" onClick={retryRoute}>{ar?'إعادة حساب الطريق':'Retry route'}</button></p>}
  </div>
  <div ref={node} className="live-nav-map" aria-label={ar?'خريطة الملاحة الحية':'Live navigation map'}/>
  <footer className="live-nav-info-card">
   {done?<><p role="status">{ar?'تم استلام الوجبة ❤️':'Meal received ❤️'}</p><button className="primary-button" onClick={onClose}>{ar?'إغلاق':'Close'}</button></>:<>
    <div className="live-nav-info-row"><div className="live-nav-info-distance"><MapPin size={18}/><strong data-testid="route-distance">{metrics?formatDistance(metrics.remainingMeters/1000,language):'—'}</strong></div><div className="live-nav-info-eta" data-testid="route-eta">{metrics?`${Math.max(1,Math.ceil(metrics.remainingSeconds/60))} ${ar?'دقائق تقريبًا':'min approx.'}`:'—'}</div></div>
    {metrics&&<p data-testid="route-instruction">{maneuverText(metrics.step,ar)}</p>}
    {location.fix&&<small>{ar?'دقة GPS':'GPS accuracy'} ±{Math.round(location.fix.accuracy)} {ar?'م':'m'}</small>}
    {route&&route.endOffset>20&&<p>{ar?'نهاية الطريق المتاح قريبة من الطعام؛ اتبع الدبوس وتعليمات الاستلام للجزء الأخير.':'The walkable road ends near the food. Follow the pin and pickup instructions for the last part.'}{location.fix&&target&&<small> {ar?'المسافة المباشرة إلى الدبوس: ':'Straight-line distance to the pin: '}{formatDistance(distanceKm(location.fix.latitude,location.fix.longitude,target.latitude,target.longitude),language)}</small>}</p>}
    {nearby&&<div className="live-nav-proximity near" role="status">{ar?'أنت بالقرب من مكان استلام الوجبة ❤️':'You are near the meal pickup point ❤️'}</div>}
    {target?.instructions&&<p className="direct-nav-instructions">{target.instructions}</p>}
    <div className="direct-nav-controls"><button className="live-nav-recenter-btn" aria-pressed={follow} onClick={recenter} disabled={!location.fix}><LocateFixed size={16}/>{ar?'العودة إلى موقعي':'Back to my location'}</button>{route&&<button className="live-nav-recenter-btn" onClick={()=>{followRef.current=false;setFollow(false);map.current?.fitBounds(L.latLngBounds(route.points),{padding:[24,24],animate:false});}}>{ar?'عرض الطريق كاملًا':'Show full route'}</button>}</div>
    {nearby&&target?.status!=='ARRIVED'&&<button className="primary-button" disabled={busy} onClick={()=>void advance('ARRIVED')}><MapPin size={17}/>{ar?'وصلت إلى مكان الوجبة':'I arrived at the meal location'}</button>}
    {verified&&target?.status==='ARRIVED'&&<button className="primary-button" disabled={busy||!online} onClick={()=>setConfirmReceipt(true)}><Check size={17}/>{ar?'تم استلام الوجبة ❤️':'I received the meal ❤️'}</button>}
    {actionError&&<p role="alert">{actionError}</p>}
   </>}
  </footer>
  {confirmReceipt&&<div className="modal-overlay"><div className="modal-card" role="alertdialog"><h3>{ar?'هل استلمت الوجبة بالفعل؟':'Have you received the meal?'}</h3>{actionError&&<p role="alert">{actionError}</p>}<button className="primary-button" disabled={busy} onClick={()=>void advance('RECEIVED')}>{ar?'تأكيد الاستلام':'Confirm receipt'}</button><button className="text-button" disabled={busy} onClick={()=>setConfirmReceipt(false)}>{ar?'رجوع':'Back'}</button></div></div>}
 </div>;
}
