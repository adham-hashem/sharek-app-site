export const PUBLIC_ORIGIN='https://www.sharek.space';
const SUPABASE='https://vffncqujwdsvmxjehfgp.supabase.co';
// Public "anon" key: it is shipped in the web app bundle anyway; access is limited by the database.
const ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmZm5jcXVqd2Rzdm14amVoZmdwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1NzAzMTgsImV4cCI6MjEwNzE0NjMxOH0.LB8P4Te60YbWAW3jyoP9KCaiNviNK8Fku7naj-_Zwfs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PHOTO_PATH=/^[A-Za-z0-9/_.-]{1,300}$/;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const categories={clothing:'ملابس',school:'أدوات مدرسية',household:'أدوات منزلية'};
export function photoUrl(path){return typeof path==='string'&&PHOTO_PATH.test(path)&&!path.includes('..')?`${SUPABASE}/storage/v1/object/public/marketplace-photos/${path.split('/').map(encodeURIComponent).join('/')}`:null;}
// Uploaded photos can be several MB (WhatsApp often skips previews that large). Vercel's image
// service fetches the original from public Supabase Storage and serves a 1200 px copy, cached.
export function previewImage(original){return original?`${PUBLIC_ORIGIN}/_vercel/image?url=${encodeURIComponent(original)}&w=1200&q=80`:null;}
export function statusText(post){if(post.available)return 'متاح حاليًا';return {completed:'تم تسليم هذا الغرض',expired:'انتهت مدة عرض هذا المنشور',paused:'هذا المنشور موقوف مؤقتًا'}[post.status]??'هذا المنشور غير متاح حاليًا';}
const style='body{margin:0;background:#fffaf5;color:#38281e;font-family:system-ui,sans-serif;line-height:1.9}main{max-width:640px;margin:24px auto;padding:20px}article{padding:20px;background:white;border:1px solid #eee0d4;border-radius:22px}img{width:100%;max-height:420px;object-fit:contain;border-radius:14px}a{color:#ba4b16}.action{display:block;text-align:center;background:#f06427;color:white;padding:12px;border-radius:14px;text-decoration:none;margin-top:16px}.action.secondary{background:white;color:#ba4b16;border:1px solid #f06427}.status{padding:10px;background:#fff3e8;border-radius:12px}.muted{font-size:.85rem;color:#78665b}.tags{display:flex;gap:8px;flex-wrap:wrap}.tags span{background:#fff3e8;border-radius:999px;padding:2px 12px;font-size:.85rem}';
const play='https://play.google.com/store/apps/details?id=app.sharek.mobile';
// post === null: the post was deleted or does not exist; post === undefined: preview service unavailable.
export function renderPost(post,id){
 const url=`${PUBLIC_ORIGIN}/marketplace/${id}/`,webApp=`${PUBLIC_ORIGIN}/app/marketplace/${id}/`;
 const title=post?`${post.title} — سوق الخير | SHARek`:'سوق الخير | SHARek';
 const description=post?(String(post.description??'').slice(0,180)||'غرض مجاني يشاركه مجتمع SHARek في سوق الخير.'):post===null?'هذا المنشور لم يعد متاحًا في سوق الخير.':'منشور في سوق الخير على SHARek.';
 const image=post?previewImage(photoUrl(post.photo)):null;
 const body=post
  ?`${image?`<img src="${escape(image)}" alt="${escape(post.title)}">`:''}<h1>${escape(post.title)}</h1><div class="tags">${post.category&&categories[post.category]?`<span>${categories[post.category]}</span>`:''}${post.is_free?'<span>مجاني</span>':''}${post.area?`<span>📍 ${escape(post.area)}</span>`:''}</div><p>${escape(post.description)}</p><p class="status" role="status">${escape(statusText(post))}</p><p class="muted">التواصل مع صاحب المنشور وطلب الغرض يتمان بعد تسجيل الدخول على موقع SHARek أو في التطبيق.</p><a class="action" href="${escape(webApp)}">اعرض المنشور على موقع SHARek</a><a class="action secondary" href="${play}">تحميل التطبيق من Google Play</a>`
  :post===null
  ?`<h1>المنشور غير متاح</h1><p class="status" role="status">هذا المنشور حُذف أو لم يعد متاحًا في سوق الخير.</p><a class="action" href="${PUBLIC_ORIGIN}/app/">تصفح سوق الخير على موقع SHARek</a><a class="action secondary" href="${play}">تحميل التطبيق من Google Play</a>`
  :`<h1>منشور في سوق الخير</h1><p class="status" role="status">تعذر تحميل المعاينة الآن.</p><a class="action" href="${escape(webApp)}">اعرض المنشور على موقع SHARek</a><a class="action secondary" href="${play}">تحميل التطبيق من Google Play</a>`;
 return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)}</title>
 <link rel="canonical" href="${url}"><meta name="description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:site_name" content="SHARek"><meta property="og:locale" content="ar_AR"><meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${url}">${image?`<meta property="og:image" content="${escape(image)}"><meta property="og:image:secure_url" content="${escape(image)}"><meta property="og:image:alt" content="${escape(post.title)}">`:`<meta property="og:image" content="${PUBLIC_ORIGIN}/assets/sharek-logo.png">`}
 <meta name="twitter:card" content="${image?'summary_large_image':'summary'}"><meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">${image?`<meta name="twitter:image" content="${escape(image)}">`:''}
 <link rel="icon" type="image/png" href="${PUBLIC_ORIGIN}/assets/sharek-logo.png"><style>${style}</style></head>
 <body><main><a href="${PUBLIC_ORIGIN}/">SHARek ❤️</a><article>${body}</article></main></body></html>`;
}
export default async function handler(req,res){
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
 if(req.method!=='GET'&&req.method!=='HEAD'){res.statusCode=405;res.end();return;}
 const id=String(req.query?.id??'');
 if(!UUID.test(id)){res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');res.end(renderPost(null,'00000000-0000-0000-0000-000000000000'));return;}
 let post;
 try{
  const response=await fetch(`${SUPABASE}/rest/v1/rpc/marketplace_public_preview`,{method:'POST',headers:{'Content-Type':'application/json',apikey:ANON_KEY,Authorization:`Bearer ${ANON_KEY}`},body:JSON.stringify({p_id:id}),signal:AbortSignal.timeout(10000)});
  post=response.ok?(await response.json())??null:undefined;
 }catch{post=undefined;}
 res.statusCode=post===null?404:200;
 res.setHeader('Cache-Control',post?'public, s-maxage=60, stale-while-revalidate=300':'no-store');
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Content-Security-Policy',`default-src 'none'; img-src ${PUBLIC_ORIGIN}; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'`);
 res.end(req.method==='HEAD'?'':renderPost(post,id));
}
