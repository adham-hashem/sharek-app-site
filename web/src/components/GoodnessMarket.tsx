import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,Bookmark,CalendarClock,CheckCircle2,ChevronLeft,ChevronRight,Copy,Flag,Heart,ImagePlus,MapPin,MessageCircle,MessageSquare,MoreHorizontal,PauseCircle,Pencil,PlayCircle,RefreshCw,Search,Send,Share2,Shirt,ThumbsUp,Trash2,X} from 'lucide-react';
import {supabase,formatDistance,type Language} from '@/lib/supabase';
import {distanceKm,validCoordinates,locationIssue,type LocationFix} from '@/lib/geo';
import {type PickupPoint} from '@/lib/meal-sharing';
import {PickupMap} from './PickupMap';
import {resolveLocationAreaInfo as lookupArea,type AreaInfo} from '@/lib/location-area';
import {openMealShareSheet,parseSiteLink} from '@/lib/meal-share';
import {communityAreas,type BoundaryDataset} from '@/lib/community-areas';
import {findCommunityArea} from '@/lib/community-filters';

type Category='clothing'|'school'|'household';
export type MarketStatus='available'|'paused'|'completed'|'expired'|'unavailable'|'deleted';
export type MarketListing={id:string;owner_id:string;category:Category;subtype:string;title:string;description:string;condition:string;size:string;photos:string[];latitude:number;longitude:number;area_name:string;governorate:string;quantity:number|null;is_free:boolean;status:MarketStatus;created_at:string;owner_name:string|null;owner_avatar:string|null;like_count:number;comment_count:number;liked_by_me:boolean;saved_by_me:boolean;pickup_instructions:string;expires_at:string|null;completed_at:string|null;conversation_count?:number|null};
export type MarketComment={id:string;listing_id:string;parent_id:string|null;author_id:string;body:string;created_at:string;edited_at:string|null;author_name:string|null;author_avatar:string|null;mine:boolean};
const labels:Record<string,[string,string]>={clothing:['👕 الملابس','👕 Clothing'],school:['🎒 الأدوات المدرسية','🎒 School supplies'],household:['🏠 الأغراض المنزلية','🏠 Household items'],children:['ملابس أطفال','Children'],men:['ملابس رجالي','Men'],women:['ملابس حريمي','Women'],other:['أخرى','Other'],bags:['شنط مدرسية','School bags'],books:['كتب ومراجع','Books'],stationery:['كراسات وأقلام','Notebooks & pens'],kitchen:['أدوات المطبخ','Kitchenware'],bedding:['بطاطين ومفروشات','Bedding'],appliances:['مراوح وأجهزة منزلية','Appliances']};
const subtypes:Record<Category,string[]>={clothing:['children','men','women','other'],school:['bags','books','stationery','other'],household:['kitchen','bedding','appliances','other']};
const resolveLocationAreaInfo=(...args:Parameters<typeof lookupArea>)=>lookupArea(...args).catch(():AreaInfo=>({name:null}));
export const marketPhoto=(path:string)=>supabase.storage.from('marketplace-photos').getPublicUrl(path).data.publicUrl;
export function marketLabel(value:string,ar:boolean){return labels[value]?.[ar?0:1]??value;}
export function marketStatusLabel(status:MarketStatus,ar:boolean){
 const names:Record<MarketStatus,[string,string]>={available:['متاح','Available'],paused:['موقوف مؤقتًا','Paused'],unavailable:['موقوف مؤقتًا','Paused'],completed:['مكتمل','Delivered'],expired:['منتهي الصلاحية','Expired'],deleted:['محذوف','Deleted']};
 return names[status][ar?0:1];
}
// Shared links point to the website; Android App Links open them in the app when it is installed.
export const marketWebLink=(id:string)=>`https://www.sharek.space/marketplace/${id}/`;
export function parseMarketLink(raw:string){try{const url=new URL(raw);const id=url.protocol==='com.sharek.foodsharing:'&&url.hostname==='marketplace'?url.pathname.slice(1):parseSiteLink(raw,'marketplace');return id&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)?id:null;}catch{return null;}}

// Display periods offered at publication and renewal.
type Duration='1d'|'3d'|'1w'|'2w'|'1m'|'custom'|'none';
const durationDays:Partial<Record<Duration,number>>={'1d':1,'3d':3,'1w':7,'2w':14,'1m':30};
const durationLabels:Record<Duration,[string,string]>={'1d':['يوم','1 day'],'3d':['3 أيام','3 days'],'1w':['أسبوع','1 week'],'2w':['أسبوعان','2 weeks'],'1m':['شهر','1 month'],custom:['تاريخ محدد','Pick a date'],none:['بدون انتهاء','No end date']};
const pad=(value:number)=>String(value).padStart(2,'0');
const isoDay=(value:Date)=>`${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}`;
function expiryFor(choice:Duration,customDay:string):string|null|undefined{
 if(choice==='none')return null;
 const days=durationDays[choice];
 if(days)return new Date(Date.now()+days*86400000).toISOString();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(customDay))return undefined;
 const end=new Date(`${customDay}T23:59:00`);
 return Number.isNaN(end.valueOf())||end.valueOf()<Date.now()+30*60000?undefined:end.toISOString();
}
type OwnTab='available'|'paused'|'completed'|'expired';
const ownTabOf=(status:MarketStatus):OwnTab|null=>status==='available'?'available':status==='paused'||status==='unavailable'?'paused':status==='completed'?'completed':status==='expired'?'expired':null;
type Action='complete'|'pause'|'resume'|'delete';
const emptyListing=(userId:string,fix:LocationFix|null):MarketListing=>({id:crypto.randomUUID(),owner_id:userId,category:'clothing',subtype:'other',title:'',description:'',condition:'',size:'',photos:[],latitude:fix&&!locationIssue(fix)?fix.latitude:NaN,longitude:fix&&!locationIssue(fix)?fix.longitude:NaN,area_name:'',governorate:'',quantity:null,is_free:true,status:'available',created_at:'',owner_name:null,owner_avatar:null,like_count:0,comment_count:0,liked_by_me:false,saved_by_me:false,pickup_instructions:'',expires_at:null,completed_at:null});

type Props={language:Language;userId:string;fix:LocationFix|null;countryCode?:string|null;onRetryLocation:()=>void;onBack:()=>void;initialId?:string|null;onChat:(thread:string,partner:string)=>void;onReport?:(ownerId:string,ownerName:string)=>void;focusComments?:boolean};
export function GoodnessMarket({language,userId,fix,countryCode,onRetryLocation,onBack,initialId=null,onChat,onReport,focusComments=false}:Props){
 const ar=language==='ar',tr=(a:string,b:string)=>ar?a:b;
 const [rows,setRows]=useState<MarketListing[]>([]),[own,setOwn]=useState(false),[category,setCategory]=useState<Category|'all'>('all'),[search,setSearch]=useState(''),[detail,setDetail]=useState<MarketListing|null>(null),[busy,setBusy]=useState(false),[selected,setSelected]=useState<Set<string>>(()=>new Set()),[shareUrl,setShareUrl]=useState('');
 // Load state is separate from action errors: the empty message is only shown
 // after a successful load, and "Retry" only ever refetches.
 const [loading,setLoading]=useState(true),[loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(''),[error,setError]=useState('');
 const [savedOnly,setSavedOnly]=useState(false),[ownTab,setOwnTab]=useState<OwnTab>('available'),[menuFor,setMenuFor]=useState<string|null>(null),[photoIndex,setPhotoIndex]=useState<Record<string,number>>({});
 const [confirm,setConfirm]=useState<{ids:string[];action:Action}|null>(null),[renewing,setRenewing]=useState<MarketListing|null>(null);
 const [viewer,setViewer]=useState<{urls:string[];index:number}|null>(null);
 const [commentsFor,setCommentsFor]=useState<MarketListing|null>(null),[comments,setComments]=useState<MarketComment[]|null>(null);
 const [commentDraft,setCommentDraft]=useState(''),[replyTo,setReplyTo]=useState<MarketComment|null>(null),[editing,setEditing]=useState<MarketComment|null>(null);
 const [pending,setPending]=useState<Set<string>>(()=>new Set());
 const lock=useRef(false),version=useRef(0),alive=useRef(true);
 const [countryBoundaries,setCountryBoundaries]=useState<BoundaryDataset|null>(null),[countryError,setCountryError]=useState(false),[countryRetry,setCountryRetry]=useState(0);
 const countryCell=fix&&!locationIssue(fix)?`${fix.latitude.toFixed(2)}:${fix.longitude.toFixed(2)}`:'';
 const currentFix=useRef(fix);currentFix.current=fix;
 useEffect(()=>{let active=true;setCountryBoundaries(null);setCountryError(false);void(async()=>{try{const position=currentFix.current;const country=countryCell&&position?(await lookupArea(position.latitude,position.longitude,language)).countryCode:countryCode;if(!country)throw new Error();const boundaries=await communityAreas(country);if(active)setCountryBoundaries(boundaries);}catch{if(active)setCountryError(true);}})();return()=>{active=false;};},[countryCell,countryCode,language,countryRetry]);
 const [notice,setNotice]=useState(''),[conversations,setConversations]=useState<{thread_id:string;partner_id:string;partner_name:string}[]|null>(null);
 useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),4500);return()=>window.clearTimeout(timer);},[notice]);
 const [draft,setDraft]=useState<MarketListing|null>(null),[files,setFiles]=useState<File[]>([]),[map,setMap]=useState(false),[formError,setFormError]=useState('');
 const [duration,setDuration]=useState<Duration>('1w'),[customDay,setCustomDay]=useState('');
 // Photos already uploaded during a failed attempt are reused on retry.
 const uploaded=useRef(new Map<File,string>());
 const refresh=useCallback(async(quiet=false)=>{
  const seq=++version.current;
  if(!quiet){setLoading(true);setLoadError('');}
  try{
   const {data,error:issue}=await supabase.rpc('marketplace_feed',{p_own:own,p_id:null,p_saved:savedOnly});
   if(!alive.current||seq!==version.current)return;
   if(issue)throw issue;
   setRows((data??[]) as MarketListing[]);setLoaded(true);setLoadError('');
  }catch(cause){
   if(!alive.current||seq!==version.current)return;
   console.warn('[market] feed failed',cause);
   if(!quiet){setRows([]);setLoaded(false);}
   setLoadError(tr('تعذر تحميل السوق. أعد المحاولة.','Could not load the market. Retry.'));
  }finally{if(alive.current&&seq===version.current)setLoading(false);}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[own,savedOnly,language]);
 useEffect(()=>{alive.current=true;setRows([]);setLoaded(false);void refresh();const channel=supabase.channel(`market-${userId}-${own}-${savedOnly}`).on('postgres_changes',{event:'*',schema:'public',table:'marketplace_listings'},()=>void refresh(true)).subscribe();return()=>{alive.current=false;version.current++;void supabase.removeChannel(channel);};},[refresh,userId,own,savedOnly]);
 const loadDetail=useCallback(async(id:string)=>{const {data,error:issue}=await supabase.rpc('marketplace_feed',{p_own:false,p_id:id});if(!alive.current)return;if(issue||!data?.[0])setError(language==='ar'?'هذا العرض غير متاح حاليًا أو تعذر تحميله.':'This listing is unavailable or could not be loaded.');else setDetail(data[0]);},[language]);
 useEffect(()=>{if(initialId)void loadDetail(initialId);},[initialId,loadDetail]);
 useEffect(()=>{if(!detail)return;const channel=supabase.channel(`market-detail-${detail.id}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'marketplace_listings',filter:`id=eq.${detail.id}`},()=>void loadDetail(detail.id)).subscribe();return()=>{void supabase.removeChannel(channel);};},[detail?.id,loadDetail]);
 const reason=(cause:unknown)=>{
  const message=cause instanceof Error?cause.message:String((cause as {message?:string})?.message??'');
  if(message.includes('BLOCKED'))return tr('المراسلة غير متاحة بسبب الحظر.','Messaging is blocked.');
  if(message.includes('ARCHIVED'))return tr('المحادثة مغلقة وفق إعدادات الشات.','This conversation is closed under chat settings.');
  if(message.includes('MARKET_UNAVAILABLE'))return tr('هذا الغرض لم يعد متاحًا.','This item is no longer available.');
  if(message.includes('MARKET_EXPIRED'))return tr('انتهت مدة عرض هذا الغرض. جدّده لإعادة عرضه.','This listing has expired. Renew it to show it again.');
  if(message.includes('MARKET_INVALID_TRANSITION'))return tr('هذا الإجراء غير متاح لحالة الغرض الحالية.','This action is not available for the item’s current state.');
  if(message.includes('MARKET_INVALID_EXPIRY'))return tr('اختر مدة عرض صحيحة (بعد 30 دقيقة على الأقل وخلال سنة).','Choose a valid display period (at least 30 minutes ahead, within a year).');
  if(message.includes('MARKET_INVALID_PHOTO'))return tr('تعذر التحقق من إحدى الصور. احذفها وأعد رفعها.','One photo could not be verified. Remove it and upload it again.');
  if(message.includes('MARKET_INVALID_TITLE'))return tr('اكتب اسمًا للغرض من حرفين على الأقل.','Enter an item name of at least 2 characters.');
  if(message.includes('MARKET_INVALID_LOCATION'))return tr('حدد موقع الاستلام على الخريطة.','Select the pickup location on the map.');
  if(message.includes('MARKET_FORBIDDEN'))return tr('لا تملك صلاحية تنفيذ هذا الإجراء على هذا الغرض.','You are not allowed to do this on this item.');
  return tr('تعذر إتمام العملية. تحقق من الاتصال وحاول مجددًا.','Could not complete the action. Check your connection and retry.');
 };
 const perform=async(action:()=>Promise<void>,onError:(message:string)=>void=setError)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(cause){console.warn('[market] action failed',cause);onError(reason(cause));}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const message=(item:MarketListing)=>void perform(async()=>{const {data,error:issue}=await supabase.rpc('open_marketplace_chat',{p_listing_id:item.id});if(issue||!data)throw issue??new Error();onChat(data,item.owner_id);});
 const share=(item:MarketListing)=>void perform(async()=>{const check=await supabase.rpc('marketplace_feed',{p_id:item.id,p_own:false});if(check.error||check.data?.[0]?.status!=='available')throw new Error('MARKET_UNAVAILABLE');const url=marketWebLink(item.id);const payload={title:`${item.title} — SHARek`,text:item.title,url};try{if(await openMealShareSheet(payload,ar))return;}catch(cause){if(cause instanceof Error&&cause.name==='AbortError')return;}setShareUrl(url);});
 const statusFor:Record<Action,MarketStatus>={complete:'completed',pause:'paused',resume:'available',delete:'deleted'};
 const runAction=()=>void perform(async()=>{
  if(!confirm)return;const next=statusFor[confirm.action];
  const {error:issue}=await supabase.rpc('set_marketplace_status',{p_ids:confirm.ids,p_status:next});if(issue)throw issue;
  setConfirm(null);setSelected(new Set());
  if(detail&&confirm.ids.includes(detail.id)){if(next==='deleted')setDetail(null);else setDetail({...detail,status:next});}
  setNotice(confirm.action==='complete'?tr('تم تأكيد التسليم. أصبح الغرض مكتملًا.','Delivery confirmed. The item is now marked delivered.'):confirm.action==='pause'?tr('تم إيقاف العرض مؤقتًا.','Listing paused.'):confirm.action==='resume'?tr('تمت إعادة تفعيل العرض.','Listing reactivated.'):tr('تم حذف العرض. المحادثات محفوظة.','Listing deleted. Conversations are kept.'));
  if(own&&next!=='deleted'){const tab=ownTabOf(next);if(tab)setOwnTab(tab);}
  await refresh(true);
 },message=>{setConfirm(null);setError(message);});
 const [renewChoice,setRenewChoice]=useState<Duration>('1w'),[renewDay,setRenewDay]=useState(''),renewCycle=useRef('');
 const openRenew=(item:MarketListing)=>{setMenuFor(null);setRenewing(item);setRenewChoice('1w');setRenewDay('');renewCycle.current=crypto.randomUUID();};
 const renew=()=>void perform(async()=>{
  if(!renewing)return;const expiry=expiryFor(renewChoice,renewDay);if(expiry===undefined)throw new Error('MARKET_INVALID_EXPIRY');
  const {error:issue}=await supabase.rpc('renew_marketplace_listing',{p_listing_id:renewing.id,p_expires_at:expiry,p_cycle:renewCycle.current});if(issue)throw issue;
  if(detail?.id===renewing.id)setDetail({...detail,status:'available',expires_at:expiry});
  setRenewing(null);setNotice(tr('تم تجديد العرض وأصبح ظاهرًا في السوق.','Listing renewed and visible in the market again.'));
  if(own)setOwnTab('available');await refresh(true);
 });
 const start=(item?:MarketListing)=>{setMenuFor(null);setDraft(item?{...item}:emptyListing(userId,fix));setFiles([]);uploaded.current=new Map();setFormError('');setError('');setDuration('1w');setCustomDay('');};
 const save=()=>void perform(async()=>{
  if(!draft)return;
  if(draft.title.trim().length<2)throw new Error('MARKET_INVALID_TITLE');
  if(!validCoordinates(draft.latitude,draft.longitude))throw new Error('MARKET_INVALID_LOCATION');
  const creating=!draft.created_at,expiry=creating?expiryFor(duration,customDay):draft.expires_at;
  if(expiry===undefined)throw new Error('MARKET_INVALID_EXPIRY');
  const photos=[...draft.photos];
  for(const file of files){
   let path=uploaded.current.get(file);
   if(!path){
    path=`${userId}/${draft.id}/${crypto.randomUUID()}.${file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'}`;
    const result=await supabase.storage.from('marketplace-photos').upload(path,file);if(result.error)throw result.error;
    uploaded.current.set(file,path);
   }
   photos.push(path);
  }
  const {data,error:issue}=await supabase.rpc('save_marketplace_listing',{p_listing:{...draft,photos,is_free:true,expires_at:expiry}});
  if(issue||data!==draft.id)throw issue??new Error();
  // Success is only reported once the server has confirmed the saved row.
  setDraft(null);setFiles([]);uploaded.current=new Map();setDetail(null);setCategory('all');setSearch('');
  setSavedOnly(false);setOwn(true);setOwnTab('available');
  setNotice(creating?tr('تم نشر تبرعك بنجاح ❤️ وهو ظاهر الآن في السوق.','Your donation is published ❤️ and now visible in the market.'):tr('تم حفظ التعديلات.','Changes saved.'));
  await refresh(true);
 },setFormError);
 const pickPhotos=(list:FileList|null)=>{
  const next=Array.from(list??[]);if(!draft)return;
  const invalid=next.find(file=>!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>8*1024*1024);
  if(invalid){setFormError(tr('الصور يجب أن تكون JPG أو PNG أو WEBP وبحد أقصى 8 ميجابايت.','Photos must be JPG, PNG or WEBP, up to 8 MB each.'));return;}
  const merged=[...files,...next];
  if(merged.length+draft.photos.length>6){setFormError(tr('الحد الأقصى 6 صور.','Maximum 6 photos.'));return;}
  setFormError('');setFiles(merged);
 };
 const previews=useRef(new Map<File,string>());
 const preview=(file:File)=>{let url=previews.current.get(file);if(!url){url=URL.createObjectURL(file);previews.current.set(file,url);}return url;};
 useEffect(()=>()=>{previews.current.forEach(url=>URL.revokeObjectURL(url));},[]);
 // Optimistic interaction state: the row is corrected from the server response,
 // and rolled back to its previous value when the write fails.
 const mark=(key:string,on:boolean)=>setPending(current=>{const next=new Set(current);if(on)next.add(key);else next.delete(key);return next;});
 const patchRow=(id:string,change:Partial<MarketListing>)=>{
  setRows(current=>current.map(row=>row.id===id?{...row,...change}:row));
  setDetail(current=>current&&current.id===id?{...current,...change}:current);
  setCommentsFor(current=>current&&current.id===id?{...current,...change}:current);
 };
 const toggleLike=(item:MarketListing)=>{
  const key=`like-${item.id}`;if(pending.has(key))return;mark(key,true);
  const before={liked_by_me:item.liked_by_me,like_count:item.like_count};
  patchRow(item.id,{liked_by_me:!item.liked_by_me,like_count:Math.max(0,item.like_count+(item.liked_by_me?-1:1))});
  void(async()=>{
   try{
    const {data,error:issue}=await supabase.rpc('toggle_marketplace_like',{p_listing_id:item.id});
    if(issue||!data){patchRow(item.id,before);setError(tr('تعذر حفظ الإعجاب. حاول مجددًا.','Could not save your reaction. Please retry.'));return;}
    const result=data as {liked:boolean;likes:number};
    patchRow(item.id,{liked_by_me:result.liked,like_count:result.likes});
   }catch{patchRow(item.id,before);setError(tr('تعذر حفظ الإعجاب. حاول مجددًا.','Could not save your reaction. Please retry.'));}
   finally{mark(key,false);}
  })();
 };
 const toggleSave=(item:MarketListing)=>{
  const key=`save-${item.id}`;if(pending.has(key))return;mark(key,true);
  const before={saved_by_me:item.saved_by_me};
  patchRow(item.id,{saved_by_me:!item.saved_by_me});
  void(async()=>{
   try{
    const {data,error:issue}=await supabase.rpc('toggle_marketplace_save',{p_listing_id:item.id});
    if(issue||!data){patchRow(item.id,before);setError(tr('تعذر حفظ المنشور. حاول مجددًا.','Could not save this post. Please retry.'));return;}
    const result=data as {saved:boolean};patchRow(item.id,{saved_by_me:result.saved});
    if(savedOnly&&!result.saved)await refresh(true);
   }catch{patchRow(item.id,before);setError(tr('تعذر حفظ المنشور. حاول مجددًا.','Could not save this post. Please retry.'));}
   finally{mark(key,false);}
  })();
 };
 const loadComments=async(listingId:string)=>{
  const {data,error:issue}=await supabase.rpc('marketplace_comment_list',{p_listing_id:listingId});
  if(!alive.current)return;
  if(issue){setError(tr('تعذر تحميل التعليقات. حاول مجددًا.','Could not load comments. Please retry.'));return;}
  const list=(data??[]) as MarketComment[];setComments(list);patchRow(listingId,{comment_count:list.length});
 };
 const openComments=(item:MarketListing)=>{setMenuFor(null);setCommentsFor(item);setComments(null);setCommentDraft('');setReplyTo(null);setEditing(null);void loadComments(item.id);};
 const submitComment=()=>void perform(async()=>{
  if(!commentsFor)return;const body=commentDraft.trim();if(!body)return;
  if(editing){const {error:issue}=await supabase.rpc('edit_marketplace_comment',{p_comment_id:editing.id,p_body:body});if(issue)throw issue;}
  else{const {error:issue}=await supabase.rpc('add_marketplace_comment',{p_listing_id:commentsFor.id,p_body:body,p_parent_id:replyTo?.id??null});if(issue)throw issue;}
  setCommentDraft('');setReplyTo(null);setEditing(null);await loadComments(commentsFor.id);
 });
 const removeComment=(comment:MarketComment)=>void perform(async()=>{
  const {error:issue}=await supabase.rpc('delete_marketplace_comment',{p_comment_id:comment.id});if(issue)throw issue;
  if(editing?.id===comment.id){setEditing(null);setCommentDraft('');}
  if(commentsFor)await loadComments(commentsFor.id);
 });
 const showConversations=(item:MarketListing)=>{setMenuFor(null);void perform(async()=>{const {data,error:issue}=await supabase.rpc('marketplace_conversations',{p_listing_id:item.id});if(issue)throw issue;setConversations(data??[]);});};
 const listingLink=(item:MarketListing)=>marketWebLink(item.id);
 const copyLink=(item:MarketListing)=>{setMenuFor(null);
  void navigator.clipboard.writeText(listingLink(item))
   .then(()=>setNotice(tr('تم نسخ رابط المنشور.','Post link copied.')))
   .catch(()=>setShareUrl(listingLink(item)));
 };
 const shift=(item:MarketListing,step:number)=>setPhotoIndex(current=>{
  const total=item.photos.length;if(total<2)return current;
  const next=(((current[item.id]??0)+step)%total+total)%total;return {...current,[item.id]:next};
 });
 const swipe=useRef<{id:string;x:number}|null>(null);
 const onSwipeStart=(item:MarketListing,x:number)=>{swipe.current={id:item.id,x};};
 const onSwipeEnd=(item:MarketListing,x:number)=>{
  const start=swipe.current;swipe.current=null;
  if(!start||start.id!==item.id)return;
  const delta=x-start.x;
  if(Math.abs(delta)<40)return;
  // Reading direction is mirrored in Arabic, so the step follows the layout.
  shift(item,(delta<0?1:-1)*(ar?-1:1));
 };
 const wantComments=useRef(false);
 useEffect(()=>{if(initialId&&focusComments)wantComments.current=true;},[initialId,focusComments]);
 const openCommentsRef=useRef(openComments);openCommentsRef.current=openComments;
 useEffect(()=>{if(!detail||!wantComments.current)return;wantComments.current=false;openCommentsRef.current(detail);},[detail]);
 const distance=(item:MarketListing)=>fix&&!locationIssue(fix)?distanceKm(fix.latitude,fix.longitude,item.latitude,item.longitude):null;
 const normalize=(value:string)=>value.normalize('NFKD').replace(/[ً-ٰٟـ]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').toLocaleLowerCase().trim();
 // Browsing is limited to the caller's country. While its boundaries load the
 // list waits; if they cannot be loaded the listings are still shown.
 const inCountry=(item:MarketListing)=>own||savedOnly||countryError||(countryBoundaries&&findCommunityArea(countryBoundaries.features,item.latitude,item.longitude));
 const waitingForCountry=!own&&!savedOnly&&!countryBoundaries&&!countryError;
 const displayed=rows.filter(item=>inCountry(item)&&(!own||ownTabOf(item.status)===ownTab)&&(category==='all'||item.category===category)&&normalize(`${item.title} ${item.description}`).includes(normalize(search))).sort((a,b)=>{if(own)return Date.parse(b.created_at)-Date.parse(a.created_at);const x=distance(a),y=distance(b);return x!==null&&y!==null?x-y:Date.parse(b.created_at)-Date.parse(a.created_at);});
 const ownCounts=own?rows.reduce<Record<OwnTab,number>>((counts,item)=>{const tab=ownTabOf(item.status);if(tab)counts[tab]++;return counts;},{available:0,paused:0,completed:0,expired:0}):null;
 const day=(value:string)=>new Date(value).toLocaleDateString(ar?'ar-EG':'en-US',{day:'numeric',month:'short',year:'numeric'});
 const expiryText=(item:MarketListing)=>item.status==='completed'?(item.completed_at?`${tr('اكتمل في','Delivered on')} ${day(item.completed_at)}`:''):item.expires_at?`${item.status==='expired'?tr('انتهى في','Ended on'):tr('ينتهي في','Ends on')} ${day(item.expires_at)}`:tr('بدون تاريخ انتهاء','No end date');
 const back=()=>{if(draft){setDraft(null);setMap(false);}else if(detail)setDetail(null);else onBack();setError('');};
 const isPaused=(item:MarketListing)=>item.status==='paused'||item.status==='unavailable';
 const expired=(item:MarketListing)=>Boolean(item.expires_at&&Date.parse(item.expires_at)<=Date.now());
 // Owner actions offered only where they make sense for the item's state.
 const ownerActions=(item:MarketListing)=><>
  {item.status!=='completed'&&<button onClick={()=>{setMenuFor(null);setConfirm({ids:[item.id],action:'complete'});}}><CheckCircle2 size={16}/>{tr('تم التسليم','Mark as delivered')}</button>}
  {item.status==='available'&&<button onClick={()=>{setMenuFor(null);setConfirm({ids:[item.id],action:'pause'});}}><PauseCircle size={16}/>{tr('إيقاف العرض مؤقتًا','Pause listing')}</button>}
  {isPaused(item)&&!expired(item)&&<button onClick={()=>{setMenuFor(null);setConfirm({ids:[item.id],action:'resume'});}}><PlayCircle size={16}/>{tr('إعادة تفعيل العرض','Reactivate listing')}</button>}
  {item.status!=='completed'&&<button onClick={()=>openRenew(item)}><RefreshCw size={16}/>{item.status==='available'?tr('تغيير مدة العرض','Change display period'):tr('تجديد مدة العرض','Renew listing')}</button>}
  {item.status!=='completed'&&<button onClick={()=>start(item)}><Pencil size={16}/>{tr('تعديل الغرض','Edit item')}</button>}
  <button onClick={()=>showConversations(item)}><MessageCircle size={16}/>{tr('المحادثات المرتبطة','Linked conversations')}{item.conversation_count?` (${item.conversation_count})`:''}</button>
  <button className="danger" onClick={()=>{setMenuFor(null);setConfirm({ids:[item.id],action:'delete'});}}><Trash2 size={16}/>{tr('حذف الغرض','Delete item')}</button>
 </>;
 const confirmCopy:Record<Action,[string,string,string,string]>={
  complete:['تأكيد التسليم؟','Confirm delivery?','سيصبح الغرض مكتملًا ويختفي من السوق، وسيُبلَّغ من تواصلوا بشأنه. تبقى المحادثات محفوظة.','The item becomes delivered and leaves the market, and people who asked about it are notified. Conversations are kept.'],
  pause:['إيقاف العرض مؤقتًا؟','Pause this listing?','سيختفي الغرض من السوق دون حذفه، ويمكنك إعادة تفعيله لاحقًا. لا تتغير مدة العرض.','The item leaves the market without being deleted, and you can reactivate it later. The display period does not change.'],
  resume:['إعادة تفعيل العرض؟','Reactivate this listing?','سيظهر الغرض في السوق مرة أخرى حتى نهاية مدته الحالية.','The item returns to the market until the end of its current period.'],
  delete:['حذف الغرض؟','Delete this item?','سيُخفى الغرض من السوق ومن عروضك، وتبقى المحادثات والرسائل محفوظة.','The item is hidden from the market and your listings. Conversations and messages are kept.'],
 };
 const durationPicker=(value:Duration,setValue:(next:Duration)=>void,dayValue:string,setDay:(next:string)=>void)=><div className="market-duration">
  <div className="market-chips wrap" role="radiogroup">{(Object.keys(durationLabels) as Duration[]).map(key=><button type="button" key={key} role="radio" aria-checked={value===key} className={value===key?'active':''} onClick={()=>setValue(key)}>{durationLabels[key][ar?0:1]}</button>)}</div>
  {value==='custom'&&<input type="date" min={isoDay(new Date())} value={dayValue} onChange={event=>setDay(event.target.value)} aria-label={tr('تاريخ انتهاء العرض','Listing end date')}/>}
 </div>;
 const statusBadge=(item:MarketListing)=><span className={`market-status ${isPaused(item)?'paused':item.status}`}>{marketStatusLabel(item.status,ar)}</span>;
 return <section className="goodness-market" dir={ar?'rtl':'ltr'}><header className="notif-center-header"><button className="icon-button" onClick={back} aria-label={tr('رجوع','Back')}><ArrowLeft size={20}/></button><h2>{tr('سوق الخير ❤️','Goodness Market ❤️')}</h2></header>
 {error&&!draft&&<div className="feedback error" role="alert">{error}<button className="text-button" onClick={()=>setError('')} aria-label={tr('إغلاق','Dismiss')}><X size={15}/></button></div>}
 {draft?<form className="market-form" noValidate onSubmit={event=>{event.preventDefault();save();}}>
  <h3>{draft.created_at?tr('تعديل الغرض','Edit item'):tr('تبرع بغرض ❤️','Donate an item ❤️')}</h3>
  <label>{tr('التصنيف','Category')}<select value={`${draft.category}:${draft.subtype}`} onChange={e=>{const [c,s]=e.target.value.split(':') as [Category,string];setDraft({...draft,category:c,subtype:s});}}>{(Object.keys(subtypes) as Category[]).map(c=><optgroup key={c} label={marketLabel(c,ar)}>{subtypes[c].map(s=><option key={s} value={`${c}:${s}`}>{s==='other'?`${marketLabel(c,ar)} · ${marketLabel('other',ar)}`:marketLabel(s,ar)}</option>)}</optgroup>)}</select></label>
  <label>{tr('اسم الغرض','Item name')}<input required minLength={2} maxLength={120} value={draft.title} placeholder={tr('مثال: جاكيت شتوي للأطفال','e.g. Kids’ winter jacket')} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
  <label>{tr('الوصف (اختياري)','Description (optional)')}<textarea maxLength={3000} rows={3} value={draft.description} onChange={e=>setDraft({...draft,description:e.target.value})}/></label>
  <div className="market-field"><span>{tr('الصور','Photos')} <small>{tr('حتى 6 صور','up to 6')}</small></span>
   <div className="market-photo-strip">
    {draft.photos.map(path=><div key={path}><img src={marketPhoto(path)} alt=""/><button type="button" className="icon-button" onClick={()=>setDraft({...draft,photos:draft.photos.filter(p=>p!==path)})} aria-label={tr('إزالة الصورة','Remove photo')}><X size={14}/></button></div>)}
    {files.map((file,index)=><div key={`${file.name}-${index}`}><img src={preview(file)} alt=""/><button type="button" className="icon-button" onClick={()=>setFiles(files.filter(f=>f!==file))} aria-label={tr('إزالة الصورة','Remove photo')}><X size={14}/></button></div>)}
    {draft.photos.length+files.length<6&&<label className="market-photo-add"><ImagePlus size={20}/><span>{tr('إضافة','Add')}</span><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{pickPhotos(e.target.files);e.target.value='';}}/></label>}
   </div>
  </div>
  <div className="market-field"><span>{tr('موقع الاستلام','Pickup location')}</span>
   <button type="button" className={validCoordinates(draft.latitude,draft.longitude)&&draft.area_name?'secondary-button market-location-set':'secondary-button'} onClick={()=>setMap(true)}><MapPin size={16}/>{validCoordinates(draft.latitude,draft.longitude)?(draft.area_name||tr('تم تحديد الموقع — اضغط للتعديل','Location set — tap to change')):tr('تحديد موقع الاستلام على الخريطة','Set pickup location on the map')}</button>
  </div>
  {map&&<PickupMap language={language} fix={fix} point={validCoordinates(draft.latitude,draft.longitude)?{latitude:draft.latitude,longitude:draft.longitude,source:'pin',accuracy:null,timestamp:Date.now()}:null} onRetry={onRetryLocation} onClose={()=>setMap(false)} onConfirm={(p:PickupPoint)=>{setDraft({...draft,latitude:p.latitude,longitude:p.longitude,area_name:'',governorate:''});setMap(false);void resolveLocationAreaInfo(p.latitude,p.longitude,language).then(area=>setDraft(current=>current&&current.latitude===p.latitude&&current.longitude===p.longitude?{...current,area_name:(area.name??'').slice(0,200),governorate:(area.state??area.city??'').slice(0,120)}:current));}}/>}
  <label>{tr('تعليمات الوصول لمكان الاستلام (اختياري)','Directions to the pickup spot (optional)')}<input maxLength={500} value={draft.pickup_instructions} placeholder={tr('مثال: بجوار المسجد، مدخل الشارع','e.g. next to the mosque, street entrance')} onChange={e=>setDraft({...draft,pickup_instructions:e.target.value})}/></label>
  {!draft.created_at&&<div className="market-field"><span><CalendarClock size={15}/>{tr('مدة عرض الغرض','Display period')}</span>{durationPicker(duration,setDuration,customDay,setCustomDay)}</div>}
  {draft.created_at&&<small className="market-form-note">{expiryText(draft)} · {tr('لتغيير المدة استخدم «تجديد مدة العرض».','Use “Renew listing” to change the period.')}</small>}
  <small className="market-form-note">{tr('جميع الأغراض في سوق الخير تبرعات مجانية.','Every item in the Goodness Market is a free donation.')}</small>
  {formError&&<p className="feedback error" role="alert">{formError}</p>}
  <button className="primary-button" disabled={busy} type="submit">{busy?tr('جارٍ النشر…','Publishing…'):draft.created_at?tr('حفظ التعديلات','Save changes'):tr('نشر التبرع','Publish donation')}</button>
 </form>
 :detail?<main className="market-detail">{detail.photos.length>0&&<div className="market-photos">{detail.photos.map((path,index)=><img key={path} src={marketPhoto(path)} alt={detail.title} onClick={()=>setViewer({urls:detail.photos.map(marketPhoto),index})}/>)}</div>}
  <div className="market-detail-head"><h2>{detail.title}</h2>{statusBadge(detail)}</div>
  <p className="market-detail-meta">{marketLabel(detail.category,ar)} · {marketLabel(detail.subtype,ar)} · <span className="market-tag free">{tr('مجاني','Free')}</span></p>
  {detail.owner_id===userId&&<p className="market-detail-meta"><CalendarClock size={14}/> {expiryText(detail)}</p>}
  {detail.description&&<p className="market-description">{detail.description}</p>}
  {(detail.condition||detail.size)&&<p className="market-detail-meta">{[detail.condition,detail.size].filter(Boolean).join(' · ')}</p>}
  <div className="market-owner">{detail.owner_avatar&&<img src={detail.owner_avatar} alt=""/>}<strong>{detail.owner_name??tr('مستخدم SHARek','SHARek member')}</strong></div>
  <div className="market-pickup"><MapPin size={16}/><div><strong>{detail.area_name||tr('نقطة الاستلام محفوظة على الخريطة','Pickup point saved on map')}{distance(detail)!==null&&` · ${formatDistance(distance(detail)!,language)}`}</strong>{detail.pickup_instructions&&<small>{detail.pickup_instructions}</small>}</div></div>
  <PickupMap key={detail.id} language={language} fix={fix} point={{latitude:detail.latitude,longitude:detail.longitude,source:'pin',accuracy:null,timestamp:Date.now()}} onRetry={onRetryLocation}/>
  {detail.owner_id!==userId&&detail.status==='available'&&<div className="management-actions"><button className="primary-button" disabled={busy} onClick={()=>message(detail)}><MessageCircle size={17}/>{tr('مراسلة صاحب الغرض 💬','Message the donor 💬')}</button><button className="secondary-button" disabled={busy} onClick={()=>share(detail)}><Share2 size={17}/>{tr('مشاركة','Share')}</button></div>}
  {detail.owner_id!==userId&&detail.status!=='available'&&<p className="market-unavailable">{tr('هذا الغرض لم يعد متاحًا، ولا يمكن بدء محادثات جديدة بشأنه.','This item is no longer available; new conversations about it are closed.')}</p>}
  {detail.owner_id===userId&&<div className="market-manage"><strong>{tr('إدارة الغرض','Manage item')}</strong><div className="market-manage-list">{ownerActions(detail)}</div></div>}
 </main>
 :<main>
  <div className="market-quick-actions">
   <button className="primary" onClick={()=>start()}><Heart size={15}/>{tr('تبرع بغرض','Donate')}</button>
   <button className={own?'active':''} aria-pressed={own} onClick={()=>{setOwn(!own);setSavedOnly(false);setSelected(new Set());setOwnTab('available');}}><Shirt size={15}/>{tr('عروضي','My listings')}</button>
   <button className={savedOnly?'active':''} aria-pressed={savedOnly} onClick={()=>{setSavedOnly(!savedOnly);setOwn(false);setSelected(new Set());}}><Bookmark size={15}/>{tr('المحفوظات','Saved')}</button>
  </div>
  <div className="market-search-box"><Search size={16}/><input className="market-search" type="search" placeholder={tr('ابحث بالاسم أو الوصف','Search by name or description')} value={search} onChange={e=>setSearch(e.target.value)}/></div>
  {own&&ownCounts&&<div className="market-chips" role="tablist">{(['available','paused','completed','expired'] as OwnTab[]).map(tab=><button key={tab} role="tab" aria-selected={ownTab===tab} className={ownTab===tab?'active':''} onClick={()=>{setOwnTab(tab);setSelected(new Set());}}>{tab==='available'?tr('المتاحة','Available'):tab==='paused'?tr('الموقوفة مؤقتًا','Paused'):tab==='completed'?tr('المكتملة','Delivered'):tr('المنتهية','Expired')}<b>{ownCounts[tab]}</b></button>)}</div>}
  <div className="market-chips" role="tablist">{(['all','clothing','school','household'] as const).map(c=><button key={c} role="tab" aria-selected={category===c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c==='all'?tr('الكل','All'):marketLabel(c,ar)}</button>)}</div>
  {!own&&!savedOnly&&countryError&&<p className="market-inline-note">{tr('تعذر تحديد حدود دولتك، لذلك تظهر كل العروض.','Your country boundaries could not be loaded, so all listings are shown.')}<button className="text-button" onClick={()=>setCountryRetry(n=>n+1)}>{tr('إعادة المحاولة','Retry')}</button></p>}
  {own&&displayed.length>0&&<div className="management-selection"><button className="text-button" onClick={()=>setSelected(new Set(displayed.map(r=>r.id)))}>{tr('تحديد الكل','Select all')}</button><button className="text-button" onClick={()=>setSelected(new Set())}>{tr('إلغاء التحديد','Clear selection')}</button>{selected.size>0&&<button className="secondary-button" onClick={()=>setConfirm({ids:[...selected],action:'delete'})}>{tr('حذف المحدد','Delete selected')} ({selected.size})</button>}</div>}
  {loading||(waitingForCountry&&!loadError)?<div className="community-loading market-state" role="status"><div className="loader-dot"/><span>{tr('جارٍ تحميل السوق…','Loading the market…')}</span></div>
   :loadError||!loaded?<div className="feedback error market-state" role="alert"><span>{loadError||tr('تعذر تحميل السوق. أعد المحاولة.','Could not load the market. Retry.')}</span><button className="primary-button" onClick={()=>void refresh()}>{tr('إعادة المحاولة','Retry')}</button></div>
   :!displayed.length?<div className="market-empty"><Shirt size={22}/><p>{search||category!=='all'?tr('لا توجد نتائج مطابقة.','No matching items.'):own?tr('لا توجد أغراض في هذا القسم.','No items in this section.'):savedOnly?tr('لم تحفظ أي منشور بعد.','You have not saved any posts yet.'):tr('لا توجد عروض حاليًا. شارك أول غرض ❤️','No listings yet. Donate the first item ❤️')}</p>{(search||category!=='all')?<button className="text-button" onClick={()=>{setSearch('');setCategory('all');}}>{tr('مسح البحث والفلاتر','Clear search and filters')}</button>:!savedOnly&&<button className="text-button" onClick={()=>start()}>{tr('تبرع بغرض','Donate an item')}</button>}</div>
   :<div className="market-grid">{displayed.map(item=>{const index=Math.min(photoIndex[item.id]??0,Math.max(0,item.photos.length-1)),shown=item.photos[index],away=distance(item),mine=item.owner_id===userId;
  return <article key={item.id} className="market-post">
   <header className="market-post-head">
    {own&&<label className="market-post-select"><input type="checkbox" checked={selected.has(item.id)} onChange={()=>setSelected(current=>{const next=new Set(current);if(next.has(item.id))next.delete(item.id);else next.add(item.id);return next;})}/><span className="sr-only">{tr('تحديد','Select')}</span></label>}
    {item.owner_avatar?<img className="market-post-avatar" src={item.owner_avatar} alt="" onClick={()=>item.owner_avatar&&setViewer({urls:[item.owner_avatar],index:0})}/>:<span className="market-post-avatar market-post-avatar-empty"><Shirt size={18}/></span>}
    <div className="market-post-identity">
     <strong>{item.owner_name??tr('مستخدم SHARek','SHARek member')}</strong>
     <small>{item.area_name||item.governorate||tr('نقطة الاستلام محفوظة على الخريطة','Pickup point saved on map')}{away!==null&&` · ${formatDistance(away,language)}`}</small>
    </div>
    {own&&statusBadge(item)}
    <button className="icon-button market-post-menu-trigger" aria-label={tr('خيارات المنشور','Post options')} aria-expanded={menuFor===item.id} onClick={()=>setMenuFor(menuFor===item.id?null:item.id)}><MoreHorizontal size={19}/></button>
    {menuFor===item.id&&<><div className="menu-backdrop" onClick={()=>setMenuFor(null)}/><div className="market-post-menu">
     {mine&&ownerActions(item)}
     {!mine&&onReport&&<button onClick={()=>{setMenuFor(null);onReport(item.owner_id,item.owner_name??tr('مستخدم SHARek','SHARek member'));}}><Flag size={16}/>{tr('الإبلاغ عن المنشور','Report post')}</button>}
     {item.status==='available'&&<button onClick={()=>copyLink(item)}><Copy size={16}/>{tr('نسخ رابط المنشور','Copy post link')}</button>}
     {item.status==='available'&&<button onClick={()=>{setMenuFor(null);share(item);}}><Share2 size={16}/>{tr('مشاركة المنشور','Share post')}</button>}
    </div></>}
   </header>
   <div className="market-post-media" onTouchStart={event=>onSwipeStart(item,event.touches[0].clientX)} onTouchEnd={event=>onSwipeEnd(item,event.changedTouches[0].clientX)}>
    {shown?<button className="market-post-image" onClick={()=>setViewer({urls:item.photos.map(marketPhoto),index})} aria-label={tr('تكبير الصورة','Enlarge photo')}><img src={marketPhoto(shown)} alt={item.title}/></button>
     :<button className="market-post-image market-post-image-empty" onClick={()=>void loadDetail(item.id)}><Shirt size={38}/></button>}
    {item.photos.length>1&&<>
     <button className="market-post-nav start" aria-label={tr('الصورة السابقة','Previous photo')} onClick={()=>shift(item,ar?1:-1)}><ChevronLeft size={18}/></button>
     <button className="market-post-nav end" aria-label={tr('الصورة التالية','Next photo')} onClick={()=>shift(item,ar?-1:1)}><ChevronRight size={18}/></button>
     <span className="market-post-counter">{index+1}/{item.photos.length}</span>
    </>}
   </div>
   <button className="market-post-body" onClick={()=>void loadDetail(item.id)}>
    <strong>{item.title}</strong>
    <small>{marketLabel(item.category,ar)} · {marketLabel(item.subtype,ar)}{own&&` · ${expiryText(item)}`}</small>
    {item.description&&<p>{item.description.slice(0,160)}</p>}
   </button>
   {!own&&<>
    <div className="market-post-counts">
     <span className={item.liked_by_me?'liked':''}><ThumbsUp size={14}/>{item.like_count}</span>
     <button className="text-button" onClick={()=>openComments(item)}>{item.comment_count} {tr('تعليق','comments')}</button>
    </div>
    <div className="market-post-reactions">
     <button className={item.liked_by_me?'active':''} disabled={pending.has(`like-${item.id}`)} aria-pressed={item.liked_by_me} onClick={()=>toggleLike(item)}><ThumbsUp size={17}/>{tr('إعجاب','Like')}</button>
     <button onClick={()=>openComments(item)}><MessageSquare size={17}/>{tr('تعليق','Comment')}</button>
     <button className={item.saved_by_me?'active':''} disabled={pending.has(`save-${item.id}`)} aria-pressed={item.saved_by_me} onClick={()=>toggleSave(item)}><Bookmark size={17}/>{item.saved_by_me?tr('محفوظ','Saved'):tr('حفظ','Save')}</button>
    </div>
    <div className="market-post-actions">
     <button className="secondary-button" disabled={busy} onClick={()=>share(item)}><Share2 size={16}/>{tr('مشاركة','Share')}</button>
     {!mine&&<button className="primary-button" disabled={busy||item.status!=='available'} onClick={()=>message(item)}><MessageCircle size={16}/>{tr('مراسلة','Message Donor')}</button>}
     <button className="secondary-button" disabled={!validCoordinates(item.latitude,item.longitude)} onClick={()=>void loadDetail(item.id)}><MapPin size={16}/>{tr('الموقع','Location')}</button>
    </div>
   </>}
  </article>;})}</div>}</main>}
 {notice&&<p className="feedback success" role="status">{notice}</p>}
 {conversations&&<div className="modal-overlay" onClick={()=>setConversations(null)}><div className="modal-card market-sheet" onClick={event=>event.stopPropagation()}><h3>{tr('المحادثات المرتبطة بالغرض','Conversations about this item')}</h3>{!conversations.length&&<p>{tr('لا توجد محادثات مرتبطة بعد.','No linked conversations yet.')}</p>}<div className="market-sheet-list">{conversations.map(c=><button key={c.thread_id} className="secondary-button" onClick={()=>onChat(c.thread_id,c.partner_id)}><MessageCircle size={15}/>{c.partner_name??tr('مستخدم SHARek','SHARek member')}</button>)}</div><button className="text-button" onClick={()=>setConversations(null)}>{tr('إغلاق','Close')}</button></div></div>}
 {confirm&&<div className="modal-overlay"><div className="modal-card market-sheet" role="alertdialog" aria-modal="true"><h3>{confirmCopy[confirm.action][ar?0:1]}</h3><p>{confirm.ids.length>1&&`${confirm.ids.length} · `}{confirmCopy[confirm.action][ar?2:3]}</p><div className="market-sheet-actions"><button className={confirm.action==='delete'?'primary-button danger':'primary-button'} disabled={busy} onClick={runAction}>{busy?'…':tr('تأكيد','Confirm')}</button><button className="secondary-button" disabled={busy} onClick={()=>setConfirm(null)}>{tr('إلغاء','Cancel')}</button></div></div></div>}
 {renewing&&<div className="modal-overlay"><div className="modal-card market-sheet" role="dialog" aria-modal="true"><h3>{tr('مدة عرض الغرض','Display period')}</h3><p>{renewing.title}</p>{durationPicker(renewChoice,setRenewChoice,renewDay,setRenewDay)}<div className="market-sheet-actions"><button className="primary-button" disabled={busy||(renewChoice==='custom'&&expiryFor('custom',renewDay)===undefined)} onClick={renew}>{busy?'…':tr('تجديد العرض','Renew listing')}</button><button className="secondary-button" disabled={busy} onClick={()=>setRenewing(null)}>{tr('إلغاء','Cancel')}</button></div></div></div>}
 {shareUrl&&<div className="modal-overlay"><div className="modal-card"><h3>{tr('مشاركة العرض','Share listing')}</h3><input readOnly dir="ltr" value={shareUrl} onFocus={e=>e.target.select()}/><button className="primary-button" onClick={()=>void navigator.clipboard.writeText(shareUrl).then(()=>setShareUrl('')).catch(()=>setError(tr('انسخ الرابط من الحقل.','Copy the link from the field.')))}>{tr('نسخ الرابط','Copy link')}</button><button className="text-button" onClick={()=>setShareUrl('')}>{tr('إغلاق','Close')}</button></div></div>}
 {viewer&&<div className="modal-overlay market-viewer" onClick={()=>setViewer(null)}>
  <button className="icon-button market-viewer-close" aria-label={tr('إغلاق','Close')} onClick={()=>setViewer(null)}><X size={20}/></button>
  <img src={viewer.urls[viewer.index]} alt="" onClick={event=>event.stopPropagation()}/>
  {viewer.urls.length>1&&<div className="market-viewer-nav" onClick={event=>event.stopPropagation()}>
   <button className="icon-button" aria-label={tr('السابق','Previous')} onClick={()=>setViewer(current=>current&&{...current,index:(current.index-1+current.urls.length)%current.urls.length})}><ChevronLeft size={20}/></button>
   <span>{viewer.index+1}/{viewer.urls.length}</span>
   <button className="icon-button" aria-label={tr('التالي','Next')} onClick={()=>setViewer(current=>current&&{...current,index:(current.index+1)%current.urls.length})}><ChevronRight size={20}/></button>
  </div>}
 </div>}
 {commentsFor&&<div className="modal-overlay" onClick={()=>{setCommentsFor(null);setComments(null);}}>
  <div className="modal-card market-comments" dir={ar?'rtl':'ltr'} onClick={event=>event.stopPropagation()}>
   <header><h3>{tr('التعليقات','Comments')}</h3><button className="icon-button" aria-label={tr('إغلاق','Close')} onClick={()=>{setCommentsFor(null);setComments(null);}}><X size={18}/></button></header>
   <small className="market-comments-subject">{commentsFor.title}</small>
   <div className="market-comment-list">
    {comments===null?<p>{tr('جارٍ التحميل…','Loading…')}</p>
     :comments.length===0?<p>{tr('لا توجد تعليقات بعد. كن أول من يعلّق.','No comments yet. Be the first to comment.')}</p>
     :comments.filter(entry=>!entry.parent_id).map(parent=><div className="market-comment-thread" key={parent.id}>
      {[parent,...comments.filter(reply=>reply.parent_id===parent.id)].map(entry=><article key={entry.id} className={entry.parent_id?'market-comment reply':'market-comment'}>
       {entry.author_avatar?<img src={entry.author_avatar} alt=""/>:<span className="market-comment-avatar-empty"/>}
       <div>
        <strong>{entry.author_name??tr('مستخدم SHARek','SHARek member')}</strong>
        <p>{entry.body}</p>
        <div className="market-comment-tools">
         <small>{new Date(entry.created_at).toLocaleString(ar?'ar-EG':'en-US')}{entry.edited_at&&` · ${tr('معدّل','edited')}`}</small>
         {!entry.parent_id&&<button className="text-button" onClick={()=>{setEditing(null);setReplyTo(entry);setCommentDraft('');}}>{tr('رد','Reply')}</button>}
         {entry.mine&&<button className="text-button" onClick={()=>{setReplyTo(null);setEditing(entry);setCommentDraft(entry.body);}}><Pencil size={13}/>{tr('تعديل','Edit')}</button>}
         {entry.mine&&<button className="text-button" onClick={()=>removeComment(entry)}><Trash2 size={13}/>{tr('حذف','Delete')}</button>}
        </div>
       </div>
      </article>)}
     </div>)}
   </div>
   {(replyTo||editing)&&<small className="market-comment-context">
    {editing?tr('تعديل تعليقك','Editing your comment'):`${tr('رد على','Replying to')} ${replyTo?.author_name??tr('مستخدم SHARek','SHARek member')}`}
    <button className="text-button" onClick={()=>{setReplyTo(null);setEditing(null);setCommentDraft('');}}>{tr('إلغاء','Cancel')}</button>
   </small>}
   <div className="market-comment-compose">
    <textarea maxLength={1000} value={commentDraft} placeholder={tr('اكتب تعليقًا…','Write a comment…')} onChange={event=>setCommentDraft(event.target.value)}/>
    <button className="primary-button" disabled={busy||!commentDraft.trim()} onClick={submitComment} aria-label={tr('إرسال','Send')}><Send size={17}/></button>
   </div>
  </div>
 </div>}
 </section>;
}
