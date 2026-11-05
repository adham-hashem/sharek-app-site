import {useEffect,useRef,useState} from 'react';
import {LocateFixed,MapPin,Navigation,X} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {formatDistance,type Language} from '@/lib/supabase';
import {distanceKm,locationMessage,validCoordinates} from '@/lib/geo';
import {useNavigationLocation} from '@/lib/use-navigation-location';
import {openExternalNavigation} from '@/lib/external-navigation';

type Props={language:Language;latitude:number;longitude:number;onClose:()=>void};
type Route={distance:number;duration:number;geometry:{coordinates:[number,number][]};legs?:{steps?:{maneuver?:{type?:string;modifier?:string};name?:string}[]}[]};

export function ChatLocationNavigation({language,latitude,longitude,onClose}:Props){
 const ar=language==='ar',valid=validCoordinates(latitude,longitude);
 const location=useNavigationLocation(valid);
 const node=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),origin=useRef<L.Marker|null>(null),destination=useRef<L.Marker|null>(null),line=useRef<L.Polyline|null>(null),request=useRef<AbortController|null>(null),lastRoute=useRef(0);
 const [route,setRoute]=useState<Route|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0),[navigationWarning,setNavigationWarning]=useState(false),[externalError,setExternalError]=useState(false);
 useEffect(()=>{
  if(!valid||!node.current)return;
  const instance=L.map(node.current,{zoomControl:true}).setView([latitude,longitude],16);map.current=instance;
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(instance);
  destination.current=L.marker([latitude,longitude],{icon:L.divIcon({className:'chat-nav-destination',html:'❤️',iconSize:[32,32],iconAnchor:[16,28]})}).addTo(instance);
  const resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(node.current);
  return()=>{request.current?.abort();resize.disconnect();instance.remove();map.current=null;origin.current=null;destination.current=null;line.current=null;};
 },[valid,latitude,longitude]);
 const fix=location.fix;
 useEffect(()=>{
  if(fix)return;
  request.current?.abort();origin.current?.remove();origin.current=null;
  line.current?.remove();line.current=null;setRoute(null);setLoading(false);
 },[fix]);
 useEffect(()=>{if(!fix)return;const timer=window.setInterval(()=>setRetry(value=>value+1),20000);return()=>window.clearInterval(timer);},[Boolean(fix)]);
 useEffect(()=>{
  if(!fix||!map.current)return;
  if(!origin.current)origin.current=L.marker([fix.latitude,fix.longitude],{icon:L.divIcon({className:'chat-nav-origin',html:'📍',iconSize:[32,32],iconAnchor:[16,28]})}).addTo(map.current);
  else origin.current.setLatLng([fix.latitude,fix.longitude]);
 },[fix]);
 const routeCell=fix?`${Math.round(fix.latitude*1000)}:${Math.round(fix.longitude*1000)}`:'';
 useEffect(()=>{
  if(!fix||!map.current)return;
  if(Date.now()-lastRoute.current<15000&&route)return;
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setLoading(true);setError('');
  const url=`https://router.project-osrm.org/route/v1/foot/${fix.longitude},${fix.latitude};${longitude},${latitude}?overview=full&geometries=geojson&steps=true`;
  void fetch(url,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error('route');return response.json();}).then(data=>{
   if(controller.signal.aborted)return;
   const next=data?.routes?.[0] as Route|undefined;
   if(data?.code!=='Ok'||!next||!Number.isFinite(next.distance)||!Number.isFinite(next.duration)||!Array.isArray(next.geometry?.coordinates)||next.geometry.coordinates.length<2)throw new Error('route');
   const points=next.geometry.coordinates.map(([lng,lat])=>[lat,lng] as [number,number]);
   if(!points.every(([lat,lng])=>validCoordinates(lat,lng))||!map.current)throw new Error('route');
   line.current?.remove();line.current=L.polyline(points,{color:'#f06427',weight:6,opacity:.88}).addTo(map.current);
   map.current.fitBounds(L.latLngBounds(points),{padding:[45,45]});lastRoute.current=Date.now();setRoute(next);setError('');
  }).catch(err=>{if(!controller.signal.aborted){setRoute(null);line.current?.remove();line.current=null;setError(ar?'تعذر حساب المسار. تحقق من الاتصال وحاول مجددًا.':'Could not calculate the route. Check your connection and retry.');}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[routeCell,latitude,longitude,retry,ar]);
 const start=()=>{
  if(!valid)return;
  if(!fix){setNavigationWarning(true);location.retry();return;}
  setNavigationWarning(false);setExternalError(false);
  void openExternalNavigation(fix.latitude,fix.longitude,latitude,longitude,language).catch(()=>setExternalError(true));
 };
 const firstTurn=route?.legs?.[0]?.steps?.find(step=>step.maneuver?.type&&step.maneuver.type!=='depart');
 const direction=firstTurn?.maneuver?.type==='arrive'?(ar?'تابع حتى الوجهة':'Continue to the destination'):firstTurn?.maneuver?.modifier?(ar?`تابع ${firstTurn.maneuver.modifier==='left'?'يسارًا':firstTurn.maneuver.modifier==='right'?'يمينًا':'على المسار'}`:`Continue ${firstTurn.maneuver.modifier}`):(ar?'اتبع الخط الموضح على الخريطة':'Follow the route shown on the map');
 return <div className="live-nav-overlay chat-location-navigation" dir={ar?'rtl':'ltr'}>
  <div className="live-nav-topbar"><button className="live-nav-close" onClick={onClose} aria-label={ar?'إغلاق':'Close'}><X size={20}/></button><span className="live-nav-title"><Navigation size={17}/>{ar?'الملاحة إلى الموقع المرسل':'Navigate to shared location'}</span></div>
  {valid&&<div ref={node} className="live-nav-map" aria-label={ar?'خريطة الطريق إلى الموقع المرسل':'Route map to shared location'}/>}
  <div className="live-nav-info-card">
   <div className="chat-nav-points"><span><LocateFixed size={16}/>{ar?'موقعي الحالي':'My current location'}</span><span><MapPin size={16}/>{ar?'موقع الشخص':'Shared location'}</span></div>
   {!valid?<p role="alert">{ar?'الموقع المرسل غير صالح.':'The shared location is invalid.'}</p>:!fix?<p role="status">{locationMessage(location.error,ar)} <button className="text-button" onClick={location.retry}>{ar?'إعادة المحاولة':'Retry'}</button></p>:null}
   {loading&&<p role="status">{ar?'جارٍ حساب المسار...':'Calculating route...'}</p>}
   {error&&<p role="alert">{error} <button className="text-button" onClick={()=>{lastRoute.current=0;setRetry(value=>value+1);}}>{ar?'إعادة المحاولة':'Retry'}</button></p>}
   {route&&fix&&<><div className="live-nav-info-row"><strong>{formatDistance(route.distance/1000,language)}</strong><span>{Math.max(1,Math.ceil(route.duration/60))} {ar?'دقيقة':'min'}</span></div><p>{direction}</p><small>{ar?'المسافة المباشرة':'Straight-line distance'}: {formatDistance(distanceKm(fix.latitude,fix.longitude,latitude,longitude),language)}</small></>}
  </div>
  <div className="chat-nav-footer">
   {navigationWarning&&!fix&&<p role="alert">{locationMessage(location.error,ar)}</p>}
   {externalError&&<p role="alert">{ar?'تعذر فتح تطبيق الملاحة على هذا الجهاز.':'Could not open a navigation app on this device.'}</p>}
   <button className="primary-button chat-nav-start" disabled={!valid} onClick={start}><Navigation size={17}/>{ar?'ابدأ الملاحة 📍':'Start navigation 📍'}</button>
  </div>
 </div>;
}
