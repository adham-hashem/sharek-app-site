// Nearby charities from OpenStreetMap (Overpass API), proxied for the SHARek app and website.
// Phones often cannot reach public Overpass servers (blocked TLS, 429 rate limits, very slow
// mirrors), so the app asks this endpoint first. It tries several free Overpass servers in turn
// with a time limit each, trims the answer to what the app needs, and lets Vercel's CDN cache it
// per ~1 km grid cell, so repeated searches answer instantly and Overpass is not hammered.
export const config={maxDuration:30};

const SERVERS=[
 'https://overpass-api.de/api/interpreter',
 'https://overpass.private.coffee/api/interpreter',
 'https://overpass.kumi.systems/api/interpreter',
 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const RADII=new Set([5,10,20,30]);
const USER_AGENT='SHARek/1.3 (+https://www.sharek.space; nearby charities directory)';
const BUDGET_MS=26000;

export function overpassQuery(lat,lng,radiusM,timeoutS){
 const a=`(around:${radiusM},${lat},${lng})`;
 return `[out:json][timeout:${timeoutS}];(`+
  `nwr["office"~"^(charity|ngo|association|foundation)$"]${a};`+
  `nwr["amenity"="social_facility"]${a};`+
  `nwr["social_facility"]${a};`+
  `nwr["charity"]${a};`+
  `);out center tags qt;`;
}

const KEEP=['name','name:ar','name:en','office','amenity','social_facility','social_facility:for','charity','addr:street','addr:suburb','addr:district','addr:city','operator'];
export function slimElements(elements){
 const out=[];const seen=new Set();
 for(const el of Array.isArray(elements)?elements:[]){
  if(!el||!['node','way','relation'].includes(el.type)||!Number.isSafeInteger(el.id))continue;
  const lat=el.lat??el.center?.lat,lon=el.lon??el.center?.lon;
  if(!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180||(lat===0&&lon===0))continue;
  const key=`${el.type}:${el.id}`;if(seen.has(key))continue;seen.add(key);
  const tags={};for(const k of KEEP){const v=el.tags?.[k];if(typeof v==='string'&&v.trim())tags[k]=v.slice(0,200);}
  out.push({type:el.type,id:el.id,lat,lon,tags});
 }
 return out;
}

export default async function handler(req,res){
 res.setHeader('Access-Control-Allow-Origin','*');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method==='OPTIONS'){res.statusCode=204;res.end();return;}
 if(req.method!=='GET'){res.statusCode=405;res.end();return;}
 const lat=Number(req.query?.lat),lng=Number(req.query?.lng),radiusKm=Number(req.query?.r);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!RADII.has(radiusKm)){
  res.statusCode=400;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.end(JSON.stringify({code:'INPUT_INVALID'}));return;
 }
 // ~1.1 km grid so nearby users share the CDN cache; the app measures real distances itself.
 const cLat=Math.round(lat*100)/100,cLng=Math.round(lng*100)/100;
 const started=Date.now();const attempts=[];
 for(const server of SERVERS){
  const left=BUDGET_MS-(Date.now()-started);if(left<3000)break;
  const limit=Math.min(left,radiusKm<=10?9000:14000);
  try{
   const response=await fetch(server,{method:'POST',body:'data='+encodeURIComponent(overpassQuery(cLat,cLng,radiusKm*1000,Math.ceil(limit/1000))),
    headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json','User-Agent':USER_AGENT},signal:AbortSignal.timeout(limit)});
   if(!response.ok){attempts.push(`${new URL(server).host}:${response.status}`);continue;}
   const json=await response.json();
   // Overpass reports server-side timeouts/overload in "remark" with a partial or empty result.
   if(typeof json?.remark==='string'&&/runtime error|timed out|out of memory/i.test(json.remark)){attempts.push(`${new URL(server).host}:remark`);continue;}
   const elements=slimElements(json?.elements);
   res.statusCode=200;res.setHeader('Content-Type','application/json; charset=utf-8');
   res.setHeader('Cache-Control','public, max-age=600, s-maxage=21600, stale-while-revalidate=86400');
   res.end(JSON.stringify({radius_km:radiusKm,center:[cLat,cLng],source:new URL(server).host,elements}));return;
  }catch(error){attempts.push(`${new URL(server).host}:${error?.name==='TimeoutError'?'timeout':'network'}`);}
 }
 res.statusCode=502;res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 res.end(JSON.stringify({code:'OVERPASS_UNAVAILABLE',attempts}));
}
