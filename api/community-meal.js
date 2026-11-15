// Public page for a shared community meal: https://www.sharek.space/community/meals/<id>/
// Server-rendered so WhatsApp/Facebook/Telegram crawlers get the real meal's Open Graph tags in the
// first HTML response. Data comes from community_meal_public_preview (no coordinates, pickup
// instructions or contact details). ?distance=1&lat=&lng= returns the visitor's rounded distance,
// computed in the database from the visitor's own GPS fix.
import {randomBytes} from 'node:crypto';
import {ANON_KEY,previewImage} from './market.js';
export const PUBLIC_ORIGIN='https://www.sharek.space';
const SUPABASE='https://vffncqujwdsvmxjehfgp.supabase.co';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAY='https://play.google.com/store/apps/details?id=app.sharek.mobile';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rpc=async(name,body)=>{const r=await fetch(`${SUPABASE}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON_KEY,Authorization:`Bearer ${ANON_KEY}`},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();};
export function publicPhoto(url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='vffncqujwdsvmxjehfgp.supabase.co'&&u.pathname.startsWith('/storage/v1/object/public/')?u.href:null;}catch{return null;}}
const statusText=m=>m.available?'متاحة الآن':{RESERVED:'محجوزة بالكامل',COMPLETED:'تم استلام هذه الوجبة',EXPIRED:'انتهت صلاحية هذه الوجبة',CANCELLED:'أوقف صاحبها مشاركتها'}[m.status]??'غير متاحة للحجز حاليًا';
const time=iso=>{try{return new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeStyle:'short',timeZone:'Africa/Cairo'}).format(new Date(iso));}catch{return '';}};
const style='body{margin:0;background:#fffaf5;color:#38281e;font-family:system-ui,sans-serif;line-height:1.8}main{max-width:640px;margin:0 auto;padding:16px}a{color:#ba4b16}article{background:#fff;border:1px solid #f0e2d6;border-radius:22px;padding:18px;box-shadow:0 6px 24px rgba(120,70,30,.06)}img.cover{width:100%;max-height:440px;object-fit:cover;border-radius:16px;display:block}h1{font-size:1.35rem;margin:14px 0 4px}.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}.chips span{background:#fff3e8;color:#8a4b1f;border-radius:999px;padding:3px 11px;font-size:.8rem}.chips .ok{background:#e9f7ee;color:#2f7d4f}.owner{display:flex;align-items:center;gap:10px;margin:14px 0}.owner img,.owner .ph{width:44px;height:44px;border-radius:50%;object-fit:cover;background:#fff1e8;display:grid;place-items:center}.owner small{display:block;color:#8b7465;font-size:.75rem}.distance{padding:10px 12px;background:#fffaf5;border:1px dashed #efd3bf;border-radius:12px;font-size:.88rem}.distance button{border:0;background:none;color:#ba4b16;font:inherit;text-decoration:underline;cursor:pointer;padding:0}.action{display:flex;justify-content:center;align-items:center;gap:6px;text-align:center;background:#f06427;color:#fff;padding:13px;border-radius:14px;text-decoration:none;margin-top:14px;font-weight:700}.action.secondary{background:#fff;color:#ba4b16;border:1px solid #f3c8ad;font-weight:600}.muted{font-size:.8rem;color:#78665b}.brand{display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:700;margin:6px 0 12px}.brand img{width:28px;height:28px}';

export function renderMeal(meal,id,nonce){
 const url=`${PUBLIC_ORIGIN}/community/meals/${id}/`,webApp=`${PUBLIC_ORIGIN}/app/community/meals/${id}/`;
 if(!meal)return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الوجبة غير متاحة | SHARek</title><meta name="robots" content="noindex"><meta property="og:type" content="website"><meta property="og:site_name" content="SHARek"><meta property="og:title" content="الوجبة غير متاحة | SHARek"><meta property="og:description" content="هذه الوجبة لم تعد متاحة على SHARek."><meta property="og:image" content="${PUBLIC_ORIGIN}/assets/sharek-logo.png"><meta name="twitter:card" content="summary"><style>${style}</style></head><body><main><a class="brand" href="${PUBLIC_ORIGIN}/"><img src="${PUBLIC_ORIGIN}/assets/sharek-logo.png" alt="">SHARek</a><article><h1>الوجبة غير متاحة</h1><p>هذه الوجبة حُذفت أو لم تعد متاحة على SHARek.</p><a class="action" href="${PUBLIC_ORIGIN}/app/">تصفح وجبات المجتمع على SHARek</a><a class="action secondary" href="${PLAY}">تحميل التطبيق من Google Play</a></article></main></body></html>`;
 const photo=publicPhoto(meal.photo),image=photo?previewImage(photo):null;
 const title=`${meal.name} — وجبة على SHARek`;
 const description=(String(meal.description??'').trim()||`${meal.quantity_left>0?`${meal.quantity_left} وجبة متاحة`:statusText(meal)}${meal.area?` في ${meal.area}`:''} — يشاركها مجتمع SHARek.`).slice(0,180);
 const intent=`intent://www.sharek.space/community/meals/${id}/?action=message#Intent;scheme=https;package=app.sharek.mobile;S.browser_fallback_url=${encodeURIComponent(webApp+'?action=message')};end`;
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
<link rel="canonical" href="${url}"><meta name="description" content="${escape(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="SHARek"><meta property="og:locale" content="ar_AR"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${url}">${image?`<meta property="og:image" content="${escape(image)}"><meta property="og:image:secure_url" content="${escape(image)}"><meta property="og:image:alt" content="${escape(meal.name)}">`:`<meta property="og:image" content="${PUBLIC_ORIGIN}/assets/sharek-logo.png">`}
<meta name="twitter:card" content="${image?'summary_large_image':'summary'}"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">${image?`<meta name="twitter:image" content="${escape(image)}">`:''}
<link rel="icon" type="image/png" href="${PUBLIC_ORIGIN}/assets/sharek-logo.png"><style>${style}</style></head>
<body><main><a class="brand" href="${PUBLIC_ORIGIN}/"><img src="${PUBLIC_ORIGIN}/assets/sharek-logo.png" alt="">SHARek</a><article>
${image?`<img class="cover" src="${escape(image)}" alt="${escape(meal.name)}">`:''}
<h1>${escape(meal.name)}</h1>
<div class="chips"><span class="${meal.available?'ok':''}" role="status">${escape(statusText(meal))}</span>${meal.quantity_left>0?`<span>${meal.quantity_left} وجبة متبقية</span>`:''}${meal.area?`<span>📍 ${escape(meal.area)}</span>`:''}</div>
${meal.description?`<p>${escape(meal.description)}</p>`:''}
<p class="muted">نُشرت ${escape(time(meal.created_at))}${meal.available&&meal.expires_at?` · متاحة حتى ${escape(time(meal.expires_at))}`:''}</p>
<div class="owner">${meal.owner_avatar&&publicPhoto(meal.owner_avatar)?`<img src="${escape(meal.owner_avatar)}" alt="">`:'<span class="ph">❤️</span>'}<span><small>صاحب الوجبة</small><strong>${escape(meal.owner_name||'متبرع SHARek')}${meal.owner_verified?' ✓':''}</strong></span></div>
<div class="distance" id="distance">${meal.has_location?'<button type="button" id="locate">فعّل موقعك لمعرفة المسافة</button>':'المسافة غير متاحة'}</div>
<a class="action" id="message" href="${escape(webApp)}?action=message">مراسلة صاحب الوجبة ❤️</a>
<a class="action secondary" href="${escape(webApp)}">${meal.available?'اطلب الوجبة على موقع SHARek':'عرض الوجبة على موقع SHARek'}</a>
<a class="action secondary" href="${PLAY}">تحميل تطبيق SHARek</a>
<p class="muted">تفاصيل الاستلام الدقيقة تظهر بعد تسجيل الدخول وفق قواعد الحجز في SHARek.</p>
</article></main>
<script nonce="${nonce}">
const id=${JSON.stringify(id)};
if(/Android/i.test(navigator.userAgent))document.getElementById('message').href=${JSON.stringify(intent)};
const box=document.getElementById('distance'),btn=document.getElementById('locate');
const show=t=>{box.textContent=t;};
function locate(){if(!navigator.geolocation){show('المسافة غير متاحة على هذا الجهاز');return;}
 show('جارٍ تحديد موقعك…');
 navigator.geolocation.getCurrentPosition(async p=>{try{const r=await fetch('/api/community-meal/?distance=1&id='+id+'&lat='+p.coords.latitude.toFixed(5)+'&lng='+p.coords.longitude.toFixed(5),{cache:'no-store'});const d=await r.json();
  if(!d||!d.available){show('المسافة غير متاحة');return;}const km=d.distance_km;show('على بُعد '+(km<1?Math.round(km*1000)+' متر':km.toLocaleString('ar-EG',{maximumFractionDigits:1})+' كم')+' منك (تقريبًا)');}catch{show('تعذر حساب المسافة الآن');}},
 ()=>{box.innerHTML='';const b=document.createElement('button');b.type='button';b.textContent='فعّل موقعك لمعرفة المسافة';b.onclick=locate;box.append(b);},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});}
if(btn){btn.onclick=locate;if(navigator.permissions)navigator.permissions.query({name:'geolocation'}).then(s=>{if(s.state==='granted')locate();}).catch(()=>{});}
</script></body></html>`;
}

export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.end();return;}
 const id=String(req.query?.id??'');
 if(req.query?.distance){
  res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
  const lat=Number(req.query?.lat),lng=Number(req.query?.lng);
  if(!UUID.test(id)||!Number.isFinite(lat)||!Number.isFinite(lng)){res.statusCode=400;res.end('null');return;}
  try{res.end(JSON.stringify(await rpc('community_meal_visitor_distance',{p_id:id,p_lat:lat,p_lng:lng})));}catch{res.statusCode=503;res.end('null');}
  return;
 }
 let meal=null,failed=false;
 if(UUID.test(id)){try{meal=await rpc('community_meal_public_preview',{p_id:id});}catch{failed=true;}}
 const nonce=randomBytes(18).toString('base64');
 res.statusCode=failed?503:meal?200:404;
 res.setHeader('Cache-Control',meal?'public, s-maxage=60, stale-while-revalidate=300':'no-store');
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Content-Security-Policy',`default-src 'none'; img-src ${PUBLIC_ORIGIN} ${SUPABASE}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'`);
 res.end(req.method==='HEAD'?'':renderMeal(meal,UUID.test(id)?id:'',nonce));
}
