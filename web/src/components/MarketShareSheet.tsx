import {useState} from 'react';
import {Check,Copy,Share2,X} from 'lucide-react';
import {openMealShareSheet} from '@/lib/meal-share';
import type {Language} from '@/lib/supabase';

export type MarketShare={title:string;text:string;url:string};

// Brand glyphs (simplified) so each option is recognisable at a glance.
const WhatsAppIcon=()=><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.2 2.2 2.2 0 0 0 .1-1.3c0-.1-.2-.2-.4-.3Z"/></svg>;
const FacebookIcon=()=><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12Z"/></svg>;
const TelegramIcon=()=><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.6 6.8-1.6 7.7c-.1.6-.5.7-1 .4l-2.7-2-1.3 1.3c-.2.2-.3.3-.6.3l.2-2.8 5.1-4.6c.2-.2 0-.3-.3-.1l-6.3 4-2.7-.9c-.6-.2-.6-.6.1-.9l10.6-4.1c.5-.2.9.1.8.7Z"/></svg>;

export function MarketShareSheet({share,language,onClose}:{share:MarketShare;language:Language;onClose:()=>void}){
  const ar=language==='ar',tr=(a:string,b:string)=>ar?a:b;
  const [copied,setCopied]=useState(false),[error,setError]=useState('');
  const message=`${share.text}\n${share.url}`;
  const links=[
    {key:'whatsapp',label:'WhatsApp',href:`https://wa.me/?text=${encodeURIComponent(message)}`,Icon:WhatsAppIcon},
    {key:'facebook',label:'Facebook',href:`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(share.url)}`,Icon:FacebookIcon},
    {key:'telegram',label:'Telegram',href:`https://t.me/share/url?url=${encodeURIComponent(share.url)}&text=${encodeURIComponent(share.text)}`,Icon:TelegramIcon},
  ];
  const copy=()=>{setError('');void navigator.clipboard.writeText(share.url).then(()=>{setCopied(true);window.setTimeout(()=>setCopied(false),2500);}).catch(()=>setError(tr('انسخ الرابط من الخانة أعلاه.','Copy the link from the field above.')));};
  const other=async()=>{setError('');try{if(!(await openMealShareSheet(share,ar)))setError(tr('المشاركة عبر التطبيقات الأخرى غير مدعومة هنا. استخدم الأزرار أو انسخ الرابط.','Sharing to other apps is not supported here. Use the buttons or copy the link.'));}catch(cause){if(!(cause instanceof Error&&cause.name==='AbortError'))setError(tr('تعذر فتح قائمة المشاركة.','Could not open the share menu.'));}};
  return <div className="modal-overlay market-share-overlay" onClick={onClose}>
    <div className="modal-card market-share-sheet" role="dialog" aria-modal="true" aria-labelledby="market-share-title" dir={ar?'rtl':'ltr'} onClick={e=>e.stopPropagation()}>
      <header className="market-share-head">
        <h3 id="market-share-title">{tr('مشاركة المنشور','Share post')}</h3>
        <button type="button" className="icon-button" onClick={onClose} aria-label={tr('إغلاق','Close')}><X size={18}/></button>
      </header>
      <p className="market-share-item">{share.text}</p>
      <div className="market-share-grid">
        {links.map(({key,label,href,Icon})=><a key={key} className={`market-share-option ${key}`} href={href} target="_blank" rel="noopener noreferrer"><span className="market-share-icon"><Icon/></span><span>{label}</span></a>)}
        <button type="button" className="market-share-option other" onClick={()=>void other()}><span className="market-share-icon"><Share2 size={20}/></span><span>{tr('تطبيقات أخرى','Other apps')}</span></button>
      </div>
      <div className="market-share-link">
        <input readOnly dir="ltr" value={share.url} aria-label={tr('رابط المنشور','Post link')} onFocus={e=>e.target.select()}/>
        <button type="button" className="primary-button" onClick={copy}>{copied?<Check size={16}/>:<Copy size={16}/>}{copied?tr('تم النسخ','Copied'):tr('نسخ الرابط','Copy link')}</button>
      </div>
      {error&&<p className="feedback error" role="alert">{error}</p>}
    </div>
  </div>;
}
