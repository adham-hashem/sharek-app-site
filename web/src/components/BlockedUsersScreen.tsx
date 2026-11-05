import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Shield,UserRound} from 'lucide-react';
import {supabase,type Language} from '@/lib/supabase';
import {notifyChatBlocksChanged} from '@/lib/chat-blocks';

type BlockedUser={blocked_user_id:string;display_name:string|null;avatar_url:string|null;blocked_at:string};

export function BlockedUsersScreen({language,onBack}:{language:Language;onBack:()=>void}){
 const ar=language==='ar';
 const [users,setUsers]=useState<BlockedUser[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState<string|null>(null),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const requestSequence=useRef(0);
 const load=useCallback(async()=>{
  const request=++requestSequence.current;
  const {data,error:loadError}=await supabase.rpc('get_my_blocked_users');
  if(request!==requestSequence.current)return;
  if(loadError)setError(ar?'تعذر تحميل قائمة المحظورين. حاول مجددًا.':'Could not load blocked users. Please retry.');
  else{setUsers((data??[]) as BlockedUser[]);setError('');}
  setLoading(false);
 },[ar]);
 useEffect(()=>{
  const sequence=requestSequence;
  void load();
  const channel=supabase.channel(`blocked-users-${crypto.randomUUID()}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'chat_blocked_users'},()=>void load()).subscribe();
  window.addEventListener('focus',load);
  return()=>{sequence.current++;window.removeEventListener('focus',load);void supabase.removeChannel(channel);};
 },[load]);
 const unblock=async(userId:string)=>{
  if(busy)return;
  setBusy(userId);setError('');setNotice('');
  const {error:saveError}=await supabase.rpc('unblock_user',{p_blocked_user_id:userId});
  setBusy(null);
  if(saveError){setError(ar?'تعذر إلغاء الحظر. حاول مجددًا.':'Could not unblock this user. Please retry.');return;}
  notifyChatBlocksChanged();
  await load();
  setNotice(ar?'تم إلغاء الحظر.':'User unblocked.');
 };
 return <div className="notif-settings-page" dir={ar?'rtl':'ltr'}>
  <header className="notif-center-header"><button className="icon-button" onClick={onBack} aria-label={ar?'رجوع':'Back'}><ArrowLeft size={20}/></button><h2>{ar?'المستخدمون المحظورون':'Blocked Users'}</h2></header>
  <main className="notif-settings-body blocked-users-body">
   {error&&<div className="feedback error" role="alert">{error}<button className="text-button" onClick={()=>void load()}>{ar?'إعادة المحاولة':'Retry'}</button></div>}
   {notice&&<div className="feedback" role="status">{notice}</div>}
   {loading?<div className="community-loading"><div className="loader-dot"/><span>{ar?'جارٍ التحميل':'Loading'}</span></div>:
    users.length===0?<div className="community-empty"><Shield size={23}/><p>{ar?'لا يوجد مستخدمون محظورون.':'No blocked users.'}</p></div>:
    users.map(user=><div className="blocked-user-row" key={user.blocked_user_id}>
     {user.avatar_url?<img src={user.avatar_url} alt="" className="blocked-user-avatar"/>:<span className="blocked-user-avatar blocked-user-placeholder"><UserRound size={22}/></span>}
     <strong>{user.display_name|| (ar?'مستخدم SHARek':'SHARek user')}</strong>
     <button className="secondary-button" disabled={busy!==null} onClick={()=>void unblock(user.blocked_user_id)}>{busy===user.blocked_user_id?'…':ar?'إلغاء الحظر':'Unblock User'}</button>
    </div>)}
  </main>
 </div>;
}
