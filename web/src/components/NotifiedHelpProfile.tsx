import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Clock,Heart,MapPin,MessageCircle,UserRound} from 'lucide-react';
import {supabase,type Language} from '@/lib/supabase';

export type NotifiedHelpDetails={
 request_id:string;requester_id:string;requester_name:string|null;requester_avatar:string|null;
 quantity_requested:number;requested_time:string;created_at:string;expires_at:string;
 status:string;area_name:string|null;search_resolution:string|null;
 accepted_by_me:boolean;can_accept:boolean;can_message:boolean;
};
type Props={language:Language;requestId:string;requesterId?:string|null;onBack:()=>void;
 onAccept:(requestId:string,requesterId:string)=>Promise<void>;
 onMessage:(requestId:string,requesterId:string,status:string)=>Promise<void>};

export function NotifiedHelpProfile({language,requestId,requesterId,onBack,onAccept,onMessage}:Props){
 const ar=language==='ar';
 const [details,setDetails]=useState<NotifiedHelpDetails|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refreshSequence=useRef(0);
 const refresh=useCallback(async()=>{
  const sequence=++refreshSequence.current;
  let {data,error:loadError}=await supabase.rpc('get_notified_help_request_details',{
   p_request_id:requestId,p_requester_id:requesterId??null,
  });
  // A stale requester id in an old push must not hide an otherwise authorized
  // request. The RPC still checks this caller's notification or assignment.
  if(!loadError&&!data&&requesterId){({data,error:loadError}=await supabase.rpc('get_notified_help_request_details',{p_request_id:requestId,p_requester_id:null}));}
  if(sequence!==refreshSequence.current)return;
  if(loadError){setError(ar?'تعذر تحميل الطلب. تحقق من الاتصال وحاول مجددًا.':'Could not load the request. Check your connection and retry.');}
  else if(!data){setError(ar?'هذا الطلب لم يعد متاحًا للعرض.':'This request is no longer available to view.');setDetails(null);}
  else{setDetails(data as NotifiedHelpDetails);setError('');}
  setLoading(false);
 },[requestId,requesterId,ar]);
 useEffect(()=>{const sequenceRef=refreshSequence;setLoading(true);void refresh();const timer=window.setInterval(()=>void refresh(),15000);return()=>{sequenceRef.current++;window.clearInterval(timer);};},[refresh]);
 const act=async(callback:(requestId:string,requesterId:string)=>Promise<void>)=>{
  if(!details||busy)return;
  setBusy(true);setError('');
  try{await callback(details.request_id,details.requester_id);await refresh();}
  catch{setError(ar?'تعذر إتمام العملية. تحقق من الاتصال وحالة الطلب.':'Could not complete the action. Check your connection and request status.');await refresh();}
  finally{setBusy(false);}
 };
 const open=details?.status==='SEARCHING'&&Date.parse(details.expires_at)>Date.now();
 const status=!details?'':open?(ar?'الطلب مفتوح':'Request open'):
  details.status==='ACCEPTED'&&details.accepted_by_me?(ar?'تم قبول مساعدتك':'Help accepted'):
  details.search_resolution==='meals_available'?(ar?'ظهرت وجبات قريبة':'Nearby meals became available'):
  details.status==='CANCELLED'?(ar?'أُلغي الطلب':'Request cancelled'):
  details.status==='PENDING'?(ar?'بانتظار الموافقة':'Pending approval'):
  details.status==='RECEIVED'?(ar?'تم استلام الوجبة':'Meal received'):
  details.status==='COMPLETED'?(ar?'اكتمل الطلب':'Request completed'):
  details.status==='REJECTED'?(ar?'رُفض الطلب':'Request rejected'):
  details.status==='SEARCHING'?(ar?'انتهى البحث':'Search expired'):
  details.status==='ACCEPTED'?(ar?'قبله مساعد آخر':'Accepted by another helper'):
  details.status==='NOT_FOUND'||details.status==='EXPIRED'?(ar?'انتهى الطلب':'Request expired'):
  (ar?'الطلب غير متاح':'Request unavailable');
 return <div className="notif-settings-page notified-help-profile" dir={ar?'rtl':'ltr'}>
  <header className="notif-center-header"><button className="icon-button" onClick={onBack} aria-label={ar?'رجوع':'Back'}><ArrowLeft size={20}/></button><h2>{ar?'ملف صاحب الطلب':'Requester profile'}</h2></header>
  <main className="notified-help-body">
   {loading&&!details?<div className="community-loading"><div className="loader-dot"/><span>{ar?'جارٍ تحميل الطلب':'Loading request'}</span></div>:null}
   {error&&<div className="feedback error" role="alert">{error}<button className="text-button" onClick={()=>void refresh()}>{ar?'إعادة المحاولة':'Retry'}</button></div>}
   {details&&<>
    <div className="notified-help-person">
     {details.requester_avatar?<img src={details.requester_avatar} alt=""/>:<span><UserRound size={32}/></span>}
     <h1>{details.requester_name|| (ar?'مستخدم SHARek':'SHARek member')}</h1>
     <small>{ar?'محتاج وجبة':'Needs a meal'}</small>
    </div>
    <div className="notified-help-request">
     <h3>{ar?'بيانات طلب الوجبة':'Meal request'}</h3>
     <p><Heart size={17}/>{ar?'عدد الوجبات':'Meals needed'}: <strong>{details.quantity_requested}</strong></p>
     <p><Clock size={17}/>{ar?'وقت الاحتياج':'Needed at'}: <strong>{new Date(details.requested_time).toLocaleString(ar?'ar-EG':'en-US')}</strong></p>
     <p><MapPin size={17}/>{ar?'المنطقة':'Area'}: <strong>{details.area_name|| (ar?'غير محددة':'Unavailable')}</strong></p>
     <p className="notified-help-status">{status}</p>
    </div>
    <div className="notified-help-actions">
     {details.can_message&&<button className="secondary-button" disabled={busy} onClick={()=>void act((id,requester)=>onMessage(id,requester,details.status))}><MessageCircle size={18}/>{ar?'مراسلة صاحب الطلب 💬':'Message the requester 💬'}</button>}
     {open&&details.can_accept&&<button className="primary-button" disabled={busy} onClick={()=>void act(onAccept)}><Heart size={18}/>{ar?'قبول المساعدة ❤️':'Accept help ❤️'}</button>}
    </div>
   </>}
  </main>
 </div>;
}
