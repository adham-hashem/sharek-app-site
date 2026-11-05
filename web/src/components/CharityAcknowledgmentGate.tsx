import {useCallback,useEffect,useRef,useState,type ReactNode} from 'react';
import {Heart,ArrowLeft} from 'lucide-react';
import {supabase,type Profile} from '@/lib/supabase';
import {CHARITY_ACK_COPY,CHARITY_ACK_VERSION} from '@/lib/charity-acknowledgment';
type AckState={required:boolean;version:string;account_type:'donor'|'beneficiary';consented_at:string|null;language:string|null};
export function CharityAcknowledgmentGate({profile,children}:{profile:Profile;children:ReactNode}){
 const ar=profile.language==='ar',role=profile.role==='donor'?'donor':'beneficiary';
 const [state,setState]=useState<AckState|null>(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[checked,setChecked]=useState(false);
 const lock=useRef(false),alive=useRef(true),loadId=useRef(0);
 const message=ar?'تعذر التحقق من حفظ الإقرار. تحقق من الاتصال وأعد المحاولة.':'Could not verify the saved acknowledgment. Check your connection and retry.';
 const load=useCallback(async()=>{
  const current=++loadId.current;
  setError('');setReady(false);setState(null);setChecked(false);
  try{
   const {data,error}=await supabase.rpc('get_charity_acknowledgment_state');
   if(error||!data)throw error??new Error();
   if(!alive.current||current!==loadId.current)return;
   if(data.account_type!==role){setError(ar?'تغير نوع الحساب. أعد فتح التطبيق للتحقق منه.':'The account type changed. Reopen the app to verify it.');return;}
   if(data.required&&data.version!==CHARITY_ACK_VERSION){setError(ar?'تم تحديث الإقرار. حدّث التطبيق للاطلاع على النسخة الجديدة والموافقة عليها.':'The acknowledgment has changed. Update the app to read and accept the new version.');return;}
   if(data.required)setState(data);else setReady(true);
  }catch{
   if(alive.current&&current===loadId.current)setError(message);
  }
 },[ar,message,role]);
 useEffect(()=>{alive.current=true;void load();return()=>{alive.current=false;};},[load]);
 const accept=async()=>{
  if(!checked||lock.current||!state)return;lock.current=true;setBusy(true);setError('');
  try{
   const saved=await supabase.rpc('record_charity_acknowledgment',{p_version:state.version,p_account_type:role,p_language:profile.language});
   const row=saved.data;if(saved.error||row?.user_id!==profile.id||row.account_type!==role||row.version!==state.version||!row.consented_at)throw saved.error??new Error();
   const verified=await supabase.rpc('get_charity_acknowledgment_state');
   if(verified.error||verified.data?.required!==false||verified.data.account_type!==role||verified.data.version!==state.version||!verified.data.consented_at)throw verified.error??new Error();
   if(alive.current)setReady(true);
  }catch{if(alive.current)setError(message);}finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const back=async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{const {error}=await supabase.auth.signOut({scope:'local'});if(error)throw error;}catch{setError(ar?'تعذرت العودة. حاول مرة أخرى.':'Could not go back. Please retry.');}finally{lock.current=false;if(alive.current)setBusy(false);}};
 if(ready)return <>{children}</>;
 if(!state)return <div className="loading-screen" dir={ar?'rtl':'ltr'}>{error?<><p role="alert">{error}</p><button className="primary-button" onClick={()=>void load()}>{ar?'إعادة المحاولة':'Retry'}</button><button className="text-button" onClick={()=>void back()}>{ar?'العودة':'Go Back'}</button></>:<><div className="loader-dot"/><span role="status">{ar?'جارٍ التحقق من الإقرار…':'Checking acknowledgment…'}</span></>}</div>;
 const copy=CHARITY_ACK_COPY[role][profile.language];
 return <section className="charity-ack-page" dir={ar?'rtl':'ltr'}><header className="topbar"><button className="icon-button" disabled={busy} onClick={()=>void back()} aria-label={ar?'العودة':'Go Back'}><ArrowLeft size={20}/></button><img src={import.meta.env.BASE_URL+'image.png'} className="logo logo-small" alt="SHARek"/><span className="topbar-spacer"/></header>
 <div className="charity-ack-body"><span className="section-icon"><Heart size={24}/></span><h2>{copy.title}</h2>{state&&copy.blocks.map((block,index)=>block.type==='list'?<ul key={index}>{block.items.map(item=><li key={item}>{item}</li>)}</ul>:<p key={index}>{block.text}</p>)}
 {error&&<div className="feedback error" role="alert">{error}</div>}
 <label className="recovery-confirm"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)}/>{ar?'أقر بأنني قرأت الإقرار الخاص بنوع حسابي وفهمته، وأوافق على الالتزام بإرشادات استخدام SHARek.':"I confirm that I have read and understood the acknowledgment for my account type and agree to follow SHARek's usage guidelines."}</label><button className="primary-button" disabled={!checked||busy} onClick={()=>void accept()}>{busy?(ar?'جارٍ الحفظ…':'Saving…'):(ar?'أوافق وأتابع':'Agree & Continue')}</button>
 <button className="text-button" disabled={busy} onClick={()=>void back()}>{ar?'العودة':'Go Back'}</button></div></section>;
}
