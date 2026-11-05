import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,FileText,Printer,Download,UserRound,X} from 'lucide-react';
import {supabase,type Language} from '@/lib/supabase';
import {fetchMealReports,printMealReport,printMealReports,type MealTransactionReport} from '@/lib/meal-reports';

type Tab='shared'|'received'|'all';
type Mode='all'|'month'|'year'|'range';

const pad=(value:number)=>String(value).padStart(2,'0');
const isoDay=(value:Date)=>`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`;

export function MyReports({language,profileId,onBack}:{language:Language;profileId:string;onBack:()=>void}){
 const ar=language==='ar';
 const [reports,setReports]=useState<MealTransactionReport[]>([]);
 const [tab,setTab]=useState<Tab>('all');
 const [mode,setMode]=useState<Mode>('all');
 const [month,setMonth]=useState(()=>{const now=new Date();return `${now.getFullYear()}-${pad(now.getMonth()+1)}`;});
 const [year,setYear]=useState(()=>String(new Date().getFullYear()));
 const [from,setFrom]=useState('');
 const [to,setTo]=useState('');
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [loadError,setLoadError]=useState('');
 const [loaded,setLoaded]=useState(false);
 const [busy,setBusy]=useState('');
 const [preview,setPreview]=useState<MealTransactionReport|null>(null);
 const sequence=useRef(0);

 const range=useMemo(()=>{
  if(mode==='month'&&/^\d{4}-\d{2}$/.test(month)){
   const [y,m]=month.split('-').map(Number);
   return {from:new Date(y,m-1,1).toISOString(),to:new Date(y,m,1).toISOString(),
    label:new Date(y,m-1,1).toLocaleDateString(ar?'ar-EG':'en-US',{month:'long',year:'numeric'})};
  }
  if(mode==='year'&&/^\d{4}$/.test(year)){
   const y=Number(year);
   return {from:new Date(y,0,1).toISOString(),to:new Date(y+1,0,1).toISOString(),label:year};
  }
  if(mode==='range'&&from&&to){
   const start=new Date(`${from}T00:00:00`),end=new Date(`${to}T00:00:00`);
   if(!Number.isNaN(start.valueOf())&&!Number.isNaN(end.valueOf())&&start<=end){
    end.setDate(end.getDate()+1);
    return {from:start.toISOString(),to:end.toISOString(),label:`${from} → ${to}`};
   }
  }
  return {from:null,to:null,label:ar?'كل الفترات':'All time'};
 },[mode,month,year,from,to,ar]);

 // quiet: a realtime refresh of the same period keeps the current rows on
 // screen instead of flashing the loader.
 const load=useCallback(async(quiet=false)=>{
  const request=++sequence.current;
  if(!quiet){setLoading(true);setLoadError('');setReports([]);}
  try{
   const rows=await fetchMealReports(range.from,range.to);
   if(request!==sequence.current)return;
   setReports(rows);setLoaded(true);
  }catch(cause){
   if(request!==sequence.current)return;
   console.warn('[reports] load failed',cause);
   // A failed load never shows the previous period's rows or the empty message.
   setReports([]);setLoaded(false);
   setLoadError(ar?'تعذر تحميل التقارير. تحقق من اتصالك وحاول مجددًا.':'Could not load your reports. Check your connection and retry.');
  }finally{
   if(request===sequence.current)setLoading(false);
  }
 },[range.from,range.to,ar]);

 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  let timer:number|undefined;
  const schedule=()=>{window.clearTimeout(timer);timer=window.setTimeout(()=>void load(true),250);};
  const channel=supabase.channel(`meal-reports-${profileId}`)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'meal_requests',filter:`requester_id=eq.${profileId}`},schedule)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'meal_requests',filter:`donor_id=eq.${profileId}`},schedule)
   .subscribe();
  return()=>{window.clearTimeout(timer);void supabase.removeChannel(channel);};
 },[profileId,load]);
 useEffect(()=>()=>{sequence.current++;},[]);

 const visible=useMemo(()=>reports.filter(report=>
  tab==='all'||(tab==='shared'?report.role==='donor':report.role==='beneficiary')),[reports,tab]);

 const run=async(key:string,action:()=>Promise<void>)=>{
  if(busy)return;
  setBusy(key);setError('');
  try{await action();}
  catch{setError(ar?'تعذر تجهيز التقرير للطباعة. حاول مجددًا.':'Could not prepare the report for printing. Please retry.');}
  finally{setBusy('');}
 };

 const stamp=(value:string)=>new Date(value).toLocaleString(ar?'ar-EG':'en-US');
 const roleLabel=(role:MealTransactionReport['role'])=>role==='donor'
  ?(ar?'بصفتك المتبرع':'As donor'):(ar?'بصفتك المستفيد':'As beneficiary');
 const other=(report:MealTransactionReport)=>report.role==='donor'
  ?{label:ar?'المستفيد':'Beneficiary',name:report.beneficiary_name,avatar:report.beneficiary_avatar}
  :{label:ar?'المتبرع':'Donor',name:report.donor_name,avatar:report.donor_avatar};

 return <div className="notif-settings-page reports-page" dir={ar?'rtl':'ltr'}>
  <header className="notif-center-header">
   <button className="icon-button" onClick={onBack} aria-label={ar?'رجوع':'Back'}><ArrowLeft size={20}/></button>
   <h2>{ar?'تقاريري وسجل الوجبات':'My Reports & Meal History'}</h2>
  </header>
  <main className="notif-settings-body reports-body">
   {error&&<div className="feedback error" role="alert">{error}</div>}

   <div className="reports-tabs" role="tablist">
    <button role="tab" aria-selected={tab==='shared'} className={tab==='shared'?'active':''} onClick={()=>setTab('shared')}>{ar?'الوجبات التي شاركتها':'Meals I Shared'}</button>
    <button role="tab" aria-selected={tab==='received'} className={tab==='received'?'active':''} onClick={()=>setTab('received')}>{ar?'الوجبات التي استلمتها':'Meals I Received'}</button>
    <button role="tab" aria-selected={tab==='all'} className={tab==='all'?'active':''} onClick={()=>setTab('all')}>{ar?'جميع العمليات المكتملة':'All Completed'}</button>
   </div>

   <section className="reports-filter">
    <div className="reports-filter-modes">
     {([['all',ar?'كل الفترات':'All time'],['month',ar?'شهر':'Month'],['year',ar?'سنة':'Year'],['range',ar?'فترة':'Date range']] as [Mode,string][])
      .map(([value,label])=><button key={value} className={mode===value?'active':''} onClick={()=>setMode(value)}>{label}</button>)}
    </div>
    {mode==='month'&&<label>{ar?'اختر الشهر':'Choose month'}<input type="month" value={month} onChange={event=>setMonth(event.target.value)}/></label>}
    {mode==='year'&&<label>{ar?'اختر السنة':'Choose year'}<input type="number" min="2026" max="2100" value={year} onChange={event=>setYear(event.target.value)}/></label>}
    {mode==='range'&&<div className="reports-filter-range">
     <label>{ar?'من':'From'}<input type="date" value={from} max={to||isoDay(new Date())} onChange={event=>setFrom(event.target.value)}/></label>
     <label>{ar?'إلى':'To'}<input type="date" value={to} min={from} max={isoDay(new Date())} onChange={event=>setTo(event.target.value)}/></label>
    </div>}
   </section>

   {loading?<div className="community-loading" role="status"><div className="loader-dot"/><span>{ar?'جارٍ تحميل التقارير…':'Loading reports…'}</span></div>:
    loadError||!loaded?<div className="feedback error reports-load-error" role="alert"><span>{loadError}</span><button className="primary-button" onClick={()=>void load()}>{ar?'إعادة المحاولة':'Retry'}</button></div>:
    visible.length===0?<div className="community-empty"><FileText size={23}/>
     <p>{ar?'لا توجد عمليات مكتملة في هذه الفترة':'No completed transactions in this period'}</p>
    </div>:<>
     <div className="reports-summary">
      <strong>{visible.length}</strong>
      <span>{ar?'عملية مكتملة':'completed transactions'} · {range.label}</span>
      <button className="secondary-button" disabled={busy!==''} onClick={()=>void run('combined',()=>printMealReports(visible,language,range.label))}>
       <Printer size={15}/>{ar?'تقرير مجمّع للفترة':'Combined report'}
      </button>
     </div>
     {visible.map(report=>{
      const party=other(report);
      return <article className="reports-card" key={report.id}>
       <div className="reports-card-head">
        {report.meal_photo_url
         ?<img className="reports-meal-photo" src={report.meal_photo_url} alt="" onClick={()=>setPreview(report)}/>
         :<span className="reports-meal-photo reports-photo-missing">{ar?'لا توجد صورة':'No photo'}</span>}
        <div className="reports-card-main">
         <strong>{report.meal_name||(ar?'غير متاح':'Unavailable')}</strong>
         <small className={report.role==='donor'?'reports-role donor':'reports-role beneficiary'}>{roleLabel(report.role)}</small>
         <small>{ar?'الرقم المرجعي':'Reference'}: {report.reference}</small>
         <small>{ar?'الاستلام':'Received'}: {stamp(report.received_at)}</small>
        </div>
       </div>
       <div className="reports-party">
        {party.avatar?<img src={party.avatar} alt=""/>:<span className="reports-party-placeholder"><UserRound size={16}/></span>}
        <span><small>{party.label}</small><b>{party.name||(ar?'غير متاح':'Unavailable')}</b></span>
        <span className="reports-quantity">{ar?'الكمية':'Qty'}: {report.quantity}</span>
       </div>
       <div className="reports-actions">
        <button className="primary-button" disabled={busy!==''} onClick={()=>void run(`print-${report.id}`,()=>printMealReport(report,language))}>
         <Printer size={15}/>{busy===`print-${report.id}`?'…':ar?'طباعة':'Print'}
        </button>
        <button className="secondary-button" disabled={busy!==''} onClick={()=>void run(`pdf-${report.id}`,()=>printMealReport(report,language))}>
         <Download size={15}/>{busy===`pdf-${report.id}`?'…':ar?'تنزيل PDF':'Download PDF'}
        </button>
       </div>
       <small className="reports-hint">{ar?'يفتح الزران نافذة الطباعة، ومنها تختار الطابعة أو الحفظ بصيغة PDF.':'Both buttons open the print dialog, where you can pick a printer or save as PDF.'}</small>
      </article>;
     })}
    </>}
  </main>
  {preview&&<div className="modal-overlay reports-viewer" onClick={()=>setPreview(null)}>
   <button className="icon-button reports-viewer-close" aria-label={ar?'إغلاق':'Close'} onClick={()=>setPreview(null)}><X size={20}/></button>
   {preview.meal_photo_url&&<img src={preview.meal_photo_url} alt={preview.meal_name} onClick={event=>event.stopPropagation()}/>}
  </div>}
 </div>;
}
