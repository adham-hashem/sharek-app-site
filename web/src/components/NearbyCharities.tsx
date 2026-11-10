import {useCallback,useEffect,useRef,useState} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {Capacitor} from '@capacitor/core';
import {AlertCircle,ArrowLeft,BadgeCheck,Building2,List,LocateFixed,Map as MapIcon,Navigation,RefreshCw} from 'lucide-react';
import {formatDistance,type Language} from '@/lib/supabase';
import {distanceKm,locationIssue,validCoordinates,type LocationFix} from '@/lib/geo';

export type Charity={
  id:string;
  name:string;
  address:string;
  logo_url:null;
  latitude:number;
  longitude:number;
  verified:boolean;
  distance_km:number;
  osm_type:'node'|'way'|'relation';
  osm_id:number;
  category:string;
};

type OsmTags=Record<string,string|undefined>;

type OsmElement={
  type:'node'|'way'|'relation';
  id:number;
  lat?:number;
  lon?:number;
  center?:{lat:number;lon:number};
  tags?:OsmTags;
};

type CacheEntry={timestamp:number;radius:number;charities:Omit<Charity,'distance_km'>[]};
type Raw=Omit<Charity,'distance_km'>;

const CACHE_TTL_MS=6*60*60*1000; // fresh: shown without a new search
const CACHE_KEEP_MS=7*24*60*60*1000; // older results are still shown while refreshing
const RADII_KM=[5,10,20,30];
const ENOUGH=12; // stop widening the search once this many charities are found
// Server-side proxy on sharek.space (Photon + Overpass with failover, CDN-cached per ~1 km cell).
const PROXY_URL='https://www.sharek.space/api/charities/';
const PHOTON_URL='https://photon.komoot.io/reverse';
const PHOTON_TAGS=['office:charity','office:ngo','office:association','office:foundation','amenity:social_facility'];
const OVERPASS_URLS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function cacheKey(lat:number,lng:number):string{
  return `sharek-osm-charities-v3:${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

function readCache(lat:number,lng:number):CacheEntry|null{
  try{
    const raw=localStorage.getItem(cacheKey(lat,lng));
    if(!raw)return null;
    const entry=JSON.parse(raw) as CacheEntry;
    if(!Array.isArray(entry?.charities)||Date.now()-entry.timestamp>CACHE_KEEP_MS)return null;
    return entry;
  }catch{return null;}
}

function writeCache(lat:number,lng:number,entry:CacheEntry):void{
  try{localStorage.setItem(cacheKey(lat,lng),JSON.stringify(entry));}catch{/* storage full or blocked: results still show */}
}

const CHARITY_WORDS=['خير','خيري','خيرية','جمعية','جمعيه','مؤسسة','موسسة','تكافل','إغاثة','اغاثة','وقف','صدقة','زكاة','رعاية','أيتام','ايتام','تنمية','بنك الطعام','الهلال الأحمر','كاريتاس','charity','charitable','ngo','foundation','welfare','relief','humanitarian','volunteer','benevolent','orphan','food bank','red crescent','caritas','aid'];
const SOCIAL_KINDS=['food_bank','soup_kitchen','clothes_bank','shelter','group_home','nursing_home','hospice','refugee','housing','social_centre','counselling','outreach','day_care'];

function isCharityLike(tags:OsmTags):boolean{
  const office=tags['office'],amenity=tags['amenity'],sf=tags['social_facility'];
  const name=`${tags['name']??''} ${tags['name:ar']??''} ${tags['name:en']??''}`.toLowerCase();
  if(office==='charity'||office==='ngo'||tags['charity'])return true;
  if(amenity==='social_facility')return !sf||SOCIAL_KINDS.some(t=>sf.includes(t));
  if(sf&&SOCIAL_KINDS.some(t=>sf.includes(t)))return true;
  if(office==='association'||office==='foundation')return CHARITY_WORDS.some(k=>name.includes(k));
  return false;
}

function osmElementToCharity(el:OsmElement):Raw|null{
  const tags=el.tags??{};
  if(!isCharityLike(tags))return null;
  const lat=el.lat??el.center?.lat;
  const lon=el.lon??el.center?.lon;
  if(lat==null||lon==null||!validCoordinates(lat,lon)||(lat===0&&lon===0))return null;
  const name=(tags['name']||tags['name:ar']||tags['name:en']||'').trim();
  if(!name)return null; // not identifiable without a name
  const address=[...new Set([tags['addr:street'],tags['addr:suburb'],tags['addr:district'],tags['addr:city']].filter((v):v is string=>!!v&&!!v.trim()))].join('، ');
  const office=tags['office'],amenity=tags['amenity'],sf=tags['social_facility'];
  const category=office==='charity'?'خيرية':office==='ngo'?'منظمة غير حكومية':office==='foundation'?'مؤسسة':(amenity==='social_facility'||sf)?(sf?sf.replace(/_/g,' '):'رعاية اجتماعية'):'جمعية';
  return{id:`${el.type}:${el.id}`,name,address,logo_url:null,latitude:lat,longitude:lon,verified:false,osm_type:el.type,osm_id:el.id,category};
}

function toCharities(elements:OsmElement[]):Raw[]{
  const seen=new Set<string>();const out:Raw[]=[];
  for(const el of elements){const c=osmElementToCharity(el);if(c&&!seen.has(c.id)){seen.add(c.id);out.push(c);}}
  return out;
}

class SearchError extends Error{constructor(public kind:'network'|'busy'|'server'){super(kind);}}
const timed=(signal:AbortSignal,ms:number)=>typeof AbortSignal.any==='function'?AbortSignal.any([signal,AbortSignal.timeout(ms)]):signal;

async function viaProxy(lat:number,lng:number,radiusKm:number,signal:AbortSignal):Promise<OsmElement[]>{
  const url=new URL(PROXY_URL);url.searchParams.set('lat',lat.toFixed(2));url.searchParams.set('lng',lng.toFixed(2));url.searchParams.set('r',String(radiusKm));
  const response=await fetch(url,{signal:timed(signal,28000)});
  if(!response.ok)throw new SearchError(response.status===502?'busy':'server');
  const json=await response.json() as {elements?:OsmElement[]};
  if(!Array.isArray(json.elements))throw new SearchError('server');
  return json.elements;
}

async function viaPhoton(lat:number,lng:number,radiusKm:number,signal:AbortSignal):Promise<OsmElement[]>{
  const url=new URL(PHOTON_URL);
  for(const [k,v] of Object.entries({lat:lat.toFixed(5),lon:lng.toFixed(5),radius:String(radiusKm),limit:'80'}))url.searchParams.set(k,v);
  for(const tag of PHOTON_TAGS)url.searchParams.append('osm_tag',tag);
  const response=await fetch(url,{signal:timed(signal,8000)});
  if(!response.ok)throw new SearchError(response.status===429?'busy':'server');
  const json=await response.json() as {features?:{properties?:Record<string,string>;geometry?:{coordinates?:number[]}}[]};
  const types:Record<string,OsmElement['type']>={N:'node',W:'way',R:'relation'};
  return (json.features??[]).flatMap(f=>{const p=f.properties??{},c=f.geometry?.coordinates;const type=types[p.osm_type];
    return type&&c?[{type,id:Number(p.osm_id),lat:c[1],lon:c[0],tags:{name:p.name,[p.osm_key]:p.osm_value,'addr:street':p.street,'addr:suburb':p.district,'addr:city':p.city??p.county}}]:[];});
}

async function viaOverpass(lat:number,lng:number,radiusKm:number,signal:AbortSignal):Promise<OsmElement[]>{
  // Bounding-box query: much cheaper for Overpass than many around() clauses.
  const dLat=radiusKm/111.32,dLng=radiusKm/(111.32*Math.max(Math.cos(lat*Math.PI/180),.01));
  const bbox=[lat-dLat,lng-dLng,lat+dLat,lng+dLng].map(v=>v.toFixed(4)).join(',');
  const q=`[out:json][timeout:20][bbox:${bbox}];(nwr["office"~"^(charity|ngo|association|foundation)$"];nwr["amenity"="social_facility"];nwr["social_facility"];nwr["charity"];);out center tags qt;`;
  let last:SearchError=new SearchError('network');
  for(const url of OVERPASS_URLS){
    if(signal.aborted)break;
    try{
      const response=await fetch(url,{method:'POST',body:`data=${encodeURIComponent(q)}`,headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:timed(signal,15000)});
      if(!response.ok){last=new SearchError(response.status===429||response.status===504?'busy':'server');continue;}
      const json=await response.json() as {elements?:OsmElement[];remark?:string};
      if(json.remark&&/runtime error|timed out|out of memory/i.test(json.remark)){last=new SearchError('busy');continue;}
      return json.elements??[];
    }catch(error){if(signal.aborted)throw error;last=new SearchError('network');}
  }
  throw last;
}

// One search ring. Each source has its own time limit; a failure moves on to the next source
// instead of leaving the page waiting. Only when every source fails is the ring an error.
async function searchRing(lat:number,lng:number,radiusKm:number,signal:AbortSignal):Promise<Raw[]>{
  let last:unknown=new SearchError('network');
  for(const source of [viaProxy,viaPhoton,viaOverpass]){
    try{return toCharities(await source(lat,lng,radiusKm,signal));}
    catch(error){if(signal.aborted)throw error;last=error;console.warn('[charities]',source.name,radiusKm,error);}
  }
  throw last;
}

function openGoogleMaps(charity:Charity):void{
  const url=`https://www.google.com/maps/dir/?api=1&destination=${charity.latitude},${charity.longitude}&travelmode=driving`;
  if(Capacitor.isNativePlatform())window.location.assign(url);
  else window.open(url,'_blank','noopener,noreferrer');
}

const REFETCH_KM=1.5;

type Props={language:Language;fix:LocationFix|null;locationError:string|null;onRetryLocation:()=>void;onBack:()=>void};

export function NearbyCharities({language,fix,locationError,onRetryLocation,onBack}:Props){
  const ar=language==='ar',tr=(a:string,b:string)=>ar?a:b;
  const [charities,setCharities]=useState<Raw[]>([]);
  // idle → searching (results may already be visible) → done | failed
  const [phase,setPhase]=useState<'idle'|'searching'|'done'|'failed'>('idle');
  const [failure,setFailure]=useState<'network'|'busy'|'server'|null>(null);
  const [view,setView]=useState<'list'|'map'>('list');
  const [searchRadiusKm,setSearchRadiusKm]=useState<number|null>(null);
  const usable=fix&&!locationIssue(fix)?fix:null;
  const fetchedAt=useRef<{latitude:number;longitude:number}|null>(null);
  const sequence=useRef(0);
  const active=useRef<AbortController|null>(null);
  const shown=useRef<Raw[]>([]);

  const load=useCallback(async(position:{latitude:number;longitude:number},forceRefresh=false)=>{
    const req=++sequence.current;
    active.current?.abort();
    const ctrl=new AbortController();active.current=ctrl;
    setFailure(null);
    fetchedAt.current=position;
    // 1. Saved results appear at once; fresh ones need no new search.
    const cached=readCache(position.latitude,position.longitude);
    if(cached&&(cached.charities.length||!shown.current.length)){shown.current=cached.charities;setCharities(cached.charities);setSearchRadiusKm(cached.radius);}
    if(cached&&!forceRefresh&&Date.now()-cached.timestamp<=CACHE_TTL_MS){setPhase('done');return;}
    setPhase('searching');
    // 2. Widen the search ring by ring; every ring's charities are shown as soon as it answers.
    const found=new Map<string,Raw>();
    let radius:number|null=null;
    try{
      for(const radiusKm of RADII_KM){
        const ring=await searchRing(position.latitude,position.longitude,radiusKm,ctrl.signal);
        if(req!==sequence.current)return;
        for(const c of ring)found.set(c.id,c);
        radius=radiusKm;
        // Keep showing earlier (cached) results until this search has found something.
        if(found.size||!shown.current.length){shown.current=[...found.values()];setCharities(shown.current);setSearchRadiusKm(radiusKm);}
        if(found.size>=ENOUGH)break;
      }
      writeCache(position.latitude,position.longitude,{timestamp:Date.now(),radius:radius??RADII_KM[RADII_KM.length-1],charities:[...found.values()]});
      shown.current=[...found.values()];setCharities(shown.current);setSearchRadiusKm(radius);
      setPhase('done');
    }catch(cause){
      if(req!==sequence.current||ctrl.signal.aborted)return;
      // Whatever was already found (or cached) stays on screen.
      // Saved as already stale so the next visit shows them at once and searches again.
      if(found.size)writeCache(position.latitude,position.longitude,{timestamp:Date.now()-CACHE_TTL_MS-1,radius:radius??RADII_KM[0],charities:[...found.values()]});
      setFailure(cause instanceof SearchError?cause.kind:'network');
      setPhase('failed');
    }
  },[]);

  useEffect(()=>{
    if(!usable)return;
    const last=fetchedAt.current;
    if(!last||distanceKm(last.latitude,last.longitude,usable.latitude,usable.longitude)>=REFETCH_KM){
      void load({latitude:usable.latitude,longitude:usable.longitude});
    }
  },[usable?.latitude,usable?.longitude,load]);// eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>()=>{sequence.current++;active.current?.abort();},[]);

  const sorted=usable
    ?charities.map(c=>({...c,distance_km:distanceKm(usable.latitude,usable.longitude,c.latitude,c.longitude)})).filter(c=>Number.isFinite(c.distance_km)).sort((a,b)=>a.distance_km-b.distance_km)
    :[];

  const failureText=failure==='busy'
    ?tr('خوادم OpenStreetMap مشغولة حاليًا. أعد المحاولة بعد لحظة.','OpenStreetMap servers are busy right now. Please retry in a moment.')
    :failure==='server'
    ?tr('تعذر الحصول على المؤسسات من خوادم OpenStreetMap.','Could not get charities from the OpenStreetMap servers.')
    :tr('تعذر الاتصال بخدمة البحث. تحقق من الإنترنت وأعد المحاولة.','Could not reach the search service. Check your connection and retry.');
  const issue=fix?locationIssue(fix):locationError;
  const gate=issue==='services_off'
    ?[tr('خدمة الموقع مغلقة','Location services are off'),tr('فعّل خدمة الموقع (GPS) في هاتفك لعرض أقرب المؤسسات الخيرية إليك.','Turn on location services (GPS) on your phone to see the charities nearest to you.'),tr('تفعيل الموقع','Turn on location')]
    :issue==='denied'
    ?[tr('اسمح بالوصول إلى موقعك','Allow access to your location'),tr('يحتاج هذا القسم إلى إذن الوصول لموقعك الحالي لترتيب المؤسسات من الأقرب إلى الأبعد.','This section needs access to your current location to sort charities from nearest to farthest.'),tr('السماح بالوصول للموقع','Allow location access')]
    :issue==='inaccurate'||issue==='stale'
    ?[tr('جارٍ تحسين دقة موقعك','Improving your location accuracy'),tr('ننتظر قراءة GPS حديثة ودقيقة قبل حساب المسافات.','Waiting for a fresh, precise GPS reading before measuring distances.'),tr('إعادة المحاولة','Retry')]
    :[tr('جارٍ تحديد موقعك…','Finding your location…'),tr('يجب تفعيل GPS والسماح لـ SHARek بالوصول إلى موقعك لعرض المؤسسات القريبة.','GPS must be on and SHARek must be allowed to use your location to show nearby charities.'),tr('تحديد موقعي','Locate me')];

  return(
    <div className="notif-settings-page charities-page" dir={ar?'rtl':'ltr'}>
      <header className="notif-center-header">
        <button className="icon-button" onClick={onBack} aria-label={tr('رجوع','Back')}><ArrowLeft size={20}/></button>
        <h2>{tr('المؤسسات الخيرية القريبة','Nearby Charities')}</h2>
      </header>
      <main className="notif-settings-body charities-body">
        {!usable
          ?<div className="charities-gate" role="status">
            <LocateFixed size={26}/><strong>{gate[0]}</strong><p>{gate[1]}</p>
            <button className="primary-button" onClick={onRetryLocation}>{gate[2]}</button>
          </div>
          :<>
            <div className="charities-toolbar">
              <div className="market-chips" role="tablist">
                <button role="tab" aria-selected={view==='list'} className={view==='list'?'active':''} onClick={()=>setView('list')}><List size={14}/>{tr('القائمة','List')}</button>
                <button role="tab" aria-selected={view==='map'} className={view==='map'?'active':''} onClick={()=>setView('map')}><MapIcon size={14}/>{tr('الخريطة','Map')}</button>
              </div>
              <button className="text-button charities-suggest" onClick={()=>void load({latitude:usable.latitude,longitude:usable.longitude},true)} disabled={phase==='searching'} aria-label={tr('تحديث النتائج','Refresh results')}><RefreshCw size={15}/>{tr('تحديث','Refresh')}</button>
            </div>
            {!sorted.length&&(phase==='searching'||phase==='idle')
              ?<div className="community-loading" role="status"><div className="loader-dot"/><span>{searchRadiusKm?tr(`لا توجد نتائج حتى ${searchRadiusKm} كم، جارٍ توسيع البحث…`,`Nothing within ${searchRadiusKm} km yet, widening the search…`):tr('جارٍ البحث عن أقرب المؤسسات…','Finding the nearest charities…')}</span></div>
              :!sorted.length&&phase==='failed'
              ?<div className="feedback error reports-load-error" role="alert"><AlertCircle size={16}/><span>{failureText}</span><button className="primary-button" onClick={()=>void load({latitude:usable.latitude,longitude:usable.longitude},true)}>{tr('إعادة المحاولة','Retry')}</button></div>
              :!sorted.length
              ?<div className="market-empty"><Building2 size={22}/><p>{tr('لا توجد مؤسسات خيرية مسجلة على OpenStreetMap بالقرب منك.','No charities registered on OpenStreetMap near you.')}</p>{searchRadiusKm&&<small>{tr(`تم البحث في نطاق ${searchRadiusKm} كم`,`Searched within ${searchRadiusKm} km`)}</small>}</div>
              :<>
                {phase==='searching'&&<small className="charities-radius-note" role="status"><RefreshCw size={11} className="charities-spin"/> {tr('جارٍ تحديث النتائج والبحث عن المزيد…','Updating results and looking for more…')}</small>}
                {phase==='failed'&&<div className="charities-notice" role="status"><AlertCircle size={14}/><span>{failureText} {tr('النتائج المعروضة من آخر بحث ناجح.','Showing results from the last successful search.')}</span><button className="text-button" onClick={()=>void load({latitude:usable.latitude,longitude:usable.longitude},true)}>{tr('إعادة المحاولة','Retry')}</button></div>}
                {view==='list'
              ?<>
                {searchRadiusKm&&<small className="charities-radius-note">{tr(`${sorted.length} مؤسسة في نطاق ${searchRadiusKm} كم`,`${sorted.length} charities within ${searchRadiusKm} km`)}</small>}
                <div className="charities-list">
                  {sorted.map(charity=>(
                    <button key={charity.id} className="charity-card" onClick={()=>openGoogleMaps(charity)}
                      aria-label={`${charity.name} — ${formatDistance(charity.distance_km,language)} — ${tr('فتح الاتجاهات في Google Maps','Open directions in Google Maps')}`}>
                      <span className="charity-logo-empty"><Building2 size={18}/></span>
                      <span className="charity-card-text">
                        <strong>{charity.name}{charity.verified&&<BadgeCheck size={14} className="charity-verified" aria-label={tr('موثقة','Verified')}/>}</strong>
                        {charity.address&&<small>{charity.address}</small>}
                        {charity.category&&<small className="charity-category">{charity.category}</small>}
                      </span>
                      <span className="charity-distance">{formatDistance(charity.distance_km,language)}<Navigation size={13}/></span>
                    </button>
                  ))}
                </div>
              </>
              :<CharityMap language={language} fix={usable} charities={sorted}/>}
              </>
            }
            {(sorted.length>0||phase==='done')&&<small className="community-boundary-credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>}
          </>
        }
      </main>
    </div>
  );
}

function CharityMap({language,fix,charities}:{language:Language;fix:LocationFix;charities:Charity[]}){
  const ar=language==='ar';
  const container=useRef<HTMLDivElement>(null);
  const map=useRef<L.Map|null>(null);
  const layer=useRef<L.LayerGroup|null>(null);
  const user=useRef<L.CircleMarker|null>(null);
  const framed=useRef(false);
  useEffect(()=>{
    if(!container.current)return;
    const instance=L.map(container.current,{zoomControl:true});map.current=instance;
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(instance);
    layer.current=L.layerGroup().addTo(instance);
    const resize=new ResizeObserver(()=>instance.invalidateSize());resize.observe(container.current);
    return()=>{resize.disconnect();instance.remove();map.current=null;layer.current=null;user.current=null;framed.current=false;};
  },[]);
  useEffect(()=>{
    const instance=map.current;if(!instance)return;
    if(!user.current)user.current=L.circleMarker([fix.latitude,fix.longitude],{radius:7,color:'#fff',fillColor:'#3875ef',fillOpacity:1}).addTo(instance);
    else user.current.setLatLng([fix.latitude,fix.longitude]);
  },[fix.latitude,fix.longitude]);
  useEffect(()=>{
    const instance=map.current,group=layer.current;if(!instance||!group)return;
    group.clearLayers();
    const icon=L.divIcon({className:'pickup-fixed-pin',html:'<span>🏛️</span>',iconSize:[36,42],iconAnchor:[18,40]});
    for(const charity of charities){
      if(!validCoordinates(charity.latitude,charity.longitude))continue;
      const content=document.createElement('div');content.className='charity-popup';
      const title=document.createElement('strong');title.textContent=charity.name;
      const meta=document.createElement('small');meta.textContent=formatDistance(charity.distance_km,language);
      const open=document.createElement('button');open.type='button';open.className='primary-button';
      open.textContent=ar?'الاتجاهات في Google Maps':'Directions in Google Maps';
      open.addEventListener('click',()=>openGoogleMaps(charity));
      content.append(title,meta,open);
      L.marker([charity.latitude,charity.longitude],{icon}).bindPopup(content).addTo(group);
    }
    if(!framed.current&&charities.length){
      framed.current=true;
      const points:[number,number][]=[[fix.latitude,fix.longitude],...charities.slice(0,10).map(c=>[c.latitude,c.longitude] as [number,number])];
      if(points.length>1)instance.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:16});else instance.setView(points[0],14);
    }else if(!framed.current)instance.setView([fix.latitude,fix.longitude],14);
  },[charities,fix.latitude,fix.longitude,language,ar]);
  return<div ref={container} className="charities-map" role="region" aria-label={ar?'خريطة المؤسسات الخيرية':'Charities map'}/>;
}
