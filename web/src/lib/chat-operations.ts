import {supabase,type ChatMessage} from './supabase';
import {locationIssue} from './geo';
export const CHAT_REACTIONS=['❤️','😂','😮','😢','🙏','👍'] as const;
export type ChatReaction={message_id:string;user_id:string;emoji:string;display_name:string|null};
export function chatError(error:unknown,ar:boolean){
 const message=String((error as {message?:string})?.message??error??'');
 const errors:Record<string,[string,string]>={CHAT_FORBIDDEN:['ليس لديك صلاحية الوصول إلى هذه المحادثة.','You cannot access this conversation.'],CHAT_ARCHIVED:['المحادثة مؤرشفة ولا تستقبل رسائل جديدة.','This conversation is archived.'],CHAT_BLOCKED:['لا يمكن إرسال الرسالة بسبب الحظر بين الحسابين.','Messaging is unavailable because one account has blocked the other.'],CHAT_INVALID_LOCATION:['بيانات الموقع غير صالحة. أعد تحديد موقعك.','Invalid location. Get a new GPS fix.'],CHAT_IMAGE_UNAVAILABLE:['تعذر الوصول إلى الصورة المرفوعة. حاول مجددًا.','Uploaded image unavailable. Please retry.'],CHAT_REPLY_UNAVAILABLE:['الرسالة التي ترد عليها لم تعد متاحة.','The quoted message is no longer available.'],CHAT_INVALID_TEXT:['اكتب رسالة بين حرف و2000 حرف.','Enter between 1 and 2000 characters.'],CHAT_RETRY_CONFLICT:['بيانات محاولة الإرسال تغيرت. أعد فتح المحادثة.','Message retry data changed. Reopen the conversation.'],GPS_DENIED:['اسمح بإذن الموقع لإرسال موقعك الحالي.','Allow location permission to share your current location.'],GPS_UNRELIABLE:['لم نحصل على موقع حديث ودقيق. حاول مجددًا في مكان بإشارة أفضل.','No recent accurate GPS fix. Try again with a better signal.'],IMAGE_TOO_LARGE:['حجم الصورة أكبر من 10 ميجابايت. اختر صورة أصغر.','Image exceeds 10 MB. Choose a smaller image.'],IMAGE_TYPE:['اختر صورة JPEG أو PNG أو WebP أو GIF.','Choose a JPEG, PNG, WebP or GIF image.']};
 for(const [code,copy] of Object.entries(errors))if(message.includes(code))return copy[ar?0:1];
 if(/row.level.security|permission denied|unauthorized/i.test(message))return ar?'تعذر التحقق من صلاحية هذه المحادثة. أعد تسجيل الدخول ثم حاول مجددًا.':'Could not verify access to this conversation. Sign in again and retry.';
 if(message.includes('IMAGE_PICKER_UNAVAILABLE'))return ar?'تعذر فتح معرض الصور على الهاتف. حاول مجددًا.':'Could not open the phone photo picker. Please retry.';
 if(!navigator.onLine||/network|fetch|timeout/i.test(message))return ar?'تعذر الاتصال. تحقق من الإنترنت ثم أعد المحاولة؛ لن تتكرر الرسالة.':'Connection failed. Check your internet and retry; the message will not be duplicated.';
 return ar?'تعذر إكمال العملية. أعد المحاولة؛ إذا استمرت المشكلة أعد فتح المحادثة.':'Could not complete the operation. Retry or reopen the conversation.';
}
export async function sendChatMessage(message:ChatMessage){
 const {data,error}=await supabase.rpc('send_chat_message_once',{p_client_id:message.id,p_thread_id:message.thread_id,p_body:message.body,p_message_type:message.message_type,p_media_url:message.media_url,p_reply_to_id:message.reply_to_id,p_location_lat:message.location_lat,p_location_lng:message.location_lng,p_location_live:message.location_live,p_location_expires_at:message.location_expires_at});
 if(error)throw error;if(data!==message.id)throw new Error('CHAT_SEND_UNCONFIRMED');return message.id;
}
export function currentChatLocation():Promise<GeolocationPosition>{
 return new Promise((resolve,reject)=>{if(!navigator.geolocation){reject(new Error('GPS_UNRELIABLE'));return;}navigator.geolocation.getCurrentPosition(p=>{const issue=locationIssue({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp});if(issue)reject(new Error('GPS_UNRELIABLE'));else resolve(p);},e=>reject(new Error(e.code===1?'GPS_DENIED':'GPS_UNRELIABLE')),{enableHighAccuracy:true,maximumAge:0,timeout:15000});});
}
export function mergeChatMessages(previous:ChatMessage[],incoming:ChatMessage[],pending:Set<string>=new Set()){
 const rows=new Map(previous.map(m=>[m.id,m]));for(const m of incoming){const old=rows.get(m.id);rows.set(m.id,old?.read_at&&!m.read_at?{...m,status:'read',read_at:old.read_at}:m);}
 return [...rows.values()].filter(m=>m.status!=='sending'||pending.has(m.id)||incoming.some(row=>row.id===m.id)).sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}
