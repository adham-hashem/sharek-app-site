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

const CACHE_TTL_MS=6*60*60*1000; // 6 hours
const RADII_KM=[30,35,40,50];
const OVERPASS_URLS=[
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

function cacheKey(lat:number,lng:number):string{
  return `sharek-osm-charities-v2:${lat.toFixed(2)}:${lng.toFixed(2)}`;
}

function readCache(lat:number,lng:number):CacheEntry|null{
  try{
    const raw=localStorage.getItem(cacheKey(lat,lng));
    if(!raw)return null;
    const entry=JSON.parse(raw) as CacheEntry;
    if(Date.now()-entry.timestamp>CACHE_TTL_MS)return null;
    return entry;
  }catch{return null;}
}

function writeCache(lat:number,lng:number,entry:CacheEntry):void{
  try{localStorage.setItem(cacheKey(lat,lng),JSON.stringify(entry));}catch{}
}

function isCharityLike(tags:OsmTags):boolean{
  const office=tags['office'];
  const amenity=tags['amenity'];
  const sf=tags['social_facility'];
  const name=(tags['name']??'').toLowerCase();
  if(office==='charity'||office==='ngo')return true;
  if(amenity==='social_facility'){
    if(!sf)return true;
    const charitable=['food_bank','soup_kitchen','clothes_bank','shelter','group_home','nursing_home','hospice','refugee','housing','social_centre','counselling'];
    if(charitable.some(t=>sf.includes(t)))return true;
  }
  if(office==='association'){
    const kws=['خير','خيري','خيرية','جمعية','تكافل','إغاثة','وقف','صدقة','زكاة','charity','ngo','foundation','welfare','social','relief','humanitarian','volunteer','aid','care'];
    if(kws.some(k=>name.includes(k)))return true;
  }
  return false;
}

function osmElementToCharity(el:OsmElement):Omit<Charity,'distance_km'>|null{
  const tags=el.tags??{};
  if(!isCharityLike(tags))return null;
  const lat=el.lat??el.center?.lat;
  const lon=el.lon??el.center?.lon;
  if(!lat||!lon||!validCoordinates(lat,lon))return null;
  const name=tags['name']||tags['name:ar']||tags['name:en']||'';
  if(!name.trim())return null;
  const addr=[tags['addr:street'],tags['addr:suburb'],tags['addr:city']].filter(Boolean).join('، ');
  const office=tags['office'];
  const amenity=tags['amenity'];
  const sf=tags['social_facility'];
  const category=office==='charity'?'خيرية':office==='ngo'?'منظمة غير حكومية':amenity==='social_facility'&&sf?sf.replace(/_/g,' '):'جمعية';
  return{
    id:`${el.type}:${el.id}`,
    name,
    address:addr,
    logo_url:null,
    latitude:lat,
    longitude:lon,
    verified:false,
    osm_type:el.type,
    osm_id:el.id,
    category,
  };
}

async function fetchFromOverpass(lat:number,lng:number,radiusM:number,signal:AbortSignal):Promise<Omit<Charity,'distance_km'>[]>{
  const q=`[out:json][timeout:30];
(
  node["office"="charity"](around:${radiusM},${lat},${lng});
  node["office"="ngo"](around:${radiusM},${lat},${lng});
  node["office"="association"](around:${radiusM},${lat},${lng});
  node["amenity"="social_facility"](around:${radiusM},${lat},${lng});
  way["office"="charity"](around:${radiusM},${lat},${lng});
  way["office"="ngo"](around:${radiusM},${lat},${lng});
  way["amenity"="social_facility"](around:${radiusM},${lat},${lng});
  relation["office"="charity"](around:${radiusM},${lat},${lng});
  relation["office"="ngo"](around:${radiusM},${lat},${lng});
);
out center tags;`;

  let lastError:unknown;
  for(const url of OVERPASS_URLS){
    try{
      const resp=await fetch(url,{method:'POST',body:`data=${encodeURIComponent(q)}`,headers:{'Content-Type':'application/x-www-form-urlencoded'},signal});
      if(resp.status===429){lastError=new Error('RATE_LIMIT');continue;}
      if(!resp.ok){lastError=new Error(`HTTP ${resp.status}`);continue;}
      const json=await resp.json() as {elements?:OsmElement[]};
      const seen=new Set<string>();
      const result:Omit<Charity,'distance_km'>[]=[];
      for(const el of json.elements??[]){
        const c=osmElementToCharity(el);
        if(!c)continue;
        if(seen.has(c.id))continue;
        seen.add(c.id);
        result.push(c);
      }
      return result;
    }catch(err){
      if(signal.aborted)throw err;
      lastError=err;
    }
  }
  throw lastError;
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
  const [charities,setCharities]=useState<Charity[]>([]);
  const [loading,setLoading]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [error,setError]=useState('');
  const [view,setView]=useState<'list'|'map'>('list');
  const [searchRadiusKm,setSearchRadiusKm]=useState<number|null>(null);
  const usable=fix&&!locationIssue(fix)?fix:null;
  const fetchedAt=useRef<{latitude:number;longitude:number}|null>(null);
  const sequence=useRef(0);

  const load=useCallback(async(position:{latitude:number;longitude:number},forceRefresh=false)=>{
    const req=++sequence.current;
    setLoading(true);setError('');
    if(!forceRefresh){
      const cached=readCache(position.latitude,position.longitude);
      if(cached){
        const withDist=cached.charities.map(c=>({...c,distance_km:distanceKm(position.latitude,position.longitude,c.latitude,c.longitude)})).filter(c=>Number.isFinite(c.distance_km)).sort((a,b)=>a.distance_km-b.distance_km);
        if(req!==sequence.current)return;
        setCharities(withDist);setLoaded(true);setSearchRadiusKm(cached.radius);fetchedAt.current=position;setLoading(false);
        return;
      }
    }
    const ctrl=new AbortController();
    const cleanup=()=>ctrl.abort();
    try{
      let found:Omit<Charity,'distance_km'>[]=[];
      let usedRadius=RADII_KM[0];
      for(const radiusKm of RADII_KM){
        if(req!==sequence.current){cleanup();return;}
        found=await fetchFromOverpass(position.latitude,position.longitude,radiusKm*1000,ctrl.signal);
        usedRadius=radiusKm;
        if(found.length>0)break;
      }
      if(req!==sequence.current)return;
      writeCache(position.latitude,position.longitude,{timestamp:Date.now(),radius:usedRadius,charities:found});
      fetchedAt.current=position;
      const withDist=found.map(c=>({...c,distance_km:distanceKm(position.latitude,position.longitude,c.latitude,c.longitude)})).filter(c=>Number.isFinite(c.distance_km)).sort((a,b)=>a.distance_km-b.distance_km);
      setCharities(withDist);setLoaded(true);setSearchRadiusKm(usedRadius);
    }catch(cause){
      if(req!==sequence.current)return;
      if(cause instanceof DOMException&&cause.name==='AbortError')return;
      console.warn('[charities] OSM load failed',cause);
      const isRateLimit=String((cause as{message?:string})?.message??'').includes('RATE_LIMIT');
      setError(isRateLimit?tr('خادم OpenStreetMap مشغول حاليًا. أعد المحاولة بعد لحظة.','OpenStreetMap server is busy. Please retry in a moment.'):tr('تعذر تحميل المؤسسات القريبة. تحقق من الاتصال وأعد المحاولة.','Could not load nearby charities. Check your connection and retry.'));
      setLoaded(false);setCharities([]);
    }finally{if(req===sequence.current)setLoading(false);}
  },[]);

  useEffect(()=>{
    if(!usable)return;
    const last=fetchedAt.current;
    if(!last||distanceKm(last.latitude,last.longitude,usable.latitude,usable.longitude)>=REFETCH_KM){
      void load({latitude:usable.latitude,longitude:usable.longitude});
    }
  },[usable?.latitude,usable?.longitude,load]);// eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>()=>{sequence.current++;},[]);

  const sorted=usable
    ?charities.map(c=>({...c,distance_km:distanceKm(usable.latitude,usable.longitude,c.latitude,c.longitude)})).filter(c=>Number.isFinite(c.distance_km)).sort((a,b)=>a.distance_km-b.distance_km)
    :[];

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
              <button className="text-button charities-suggest" onClick={()=>void load({latitude:usable.latitude,longitude:usable.longitude},true)} disabled={loading} aria-label={tr('تحديث النتائج','Refresh results')}><RefreshCw size={15}/>{tr('تحديث','Refresh')}</button>
            </div>
            {loading&&!loaded
              ?<div className="community-loading" role="status"><div className="loader-dot"/><span>{tr('جارٍ البحث في OpenStreetMap…','Searching OpenStreetMap…')}</span></div>
              :error
              ?<div className="feedback error reports-load-error" role="alert"><AlertCircle size={16}/><span>{error}</span><button className="primary-button" onClick={()=>void load({latitude:usable.latitude,longitude:usable.longitude},true)}>{tr('إعادة المحاولة','Retry')}</button></div>
              :!sorted.length
              ?<div className="market-empty"><Building2 size={22}/><p>{tr('لا توجد مؤسسات خيرية مسجلة على OpenStreetMap بالقرب منك.','No charities registered on OpenStreetMap near you.')}</p>{searchRadiusKm&&<small>{tr(`تم البحث في نطاق ${searchRadiusKm} كم`,`Searched within ${searchRadiusKm} km`)}</small>}</div>
              :view==='list'
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
              :<CharityMap language={language} fix={usable} charities={sorted}/>
            }
            {loaded&&<small className="community-boundary-credit"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></small>}
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
    if(!framed.current){
      framed.current=true;
      const points:[number,number][]=[[fix.latitude,fix.longitude],...charities.slice(0,10).map(c=>[c.latitude,c.longitude] as [number,number])];
      if(points.length>1)instance.fitBounds(L.latLngBounds(points),{padding:[30,30],maxZoom:16});else instance.setView(points[0],14);
    }
  },[charities,fix.latitude,fix.longitude,language,ar]);
  return<div ref={container} className="charities-map" role="region" aria-label={ar?'خريطة المؤسسات الخيرية':'Charities map'}/>;
}
