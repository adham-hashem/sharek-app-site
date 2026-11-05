import {supabase,type Meal,type MealRequest} from './supabase';
import {prepareSuccessSound,playSuccessSoundOnce} from './success-sound';
import {isReceived,publishMealRequestSaved} from './meal-operations';
export type ManagedRequest=MealRequest&{requester_name:string|null;requester_avatar:string|null;meal_name:string|null;phone:string|null;phone_shared_at:string|null};
export type ManagedMeal=Meal&{available_quantity:number};
export type MealDashboard={meals:ManagedMeal[];requests:ManagedRequest[]};
export type ReceiptTask=MealRequest&{meal_name:string;meal_photo:string|null;donor_name:string|null;donor_avatar:string|null;last_answer:'not_received'|'received'|null;answered_at:string|null;needs_rating:boolean};
export const normalPhone=(value:string)=>value.replace(/[٠-٩۰-۹]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.includes(c)?'٠١٢٣٤٥٦٧٨٩'.indexOf(c):'۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[\s()-]/g,'').replace(/^00/,'+');
export const validPhone=(value:string)=>/^\+[1-9][0-9]{7,14}$/.test(normalPhone(value));
export function requestStatus(status:string,ar:boolean){const labels:Record<string,[string,string]>={PENDING:['بانتظار الموافقة','Pending approval'],ACCEPTED:['مقبول','Accepted'],WAITING_FOR_PICKUP:['جاهز للاستلام','Ready for pickup'],ON_THE_WAY:['في الطريق','On the way'],ARRIVED:['وصل لنقطة الاستلام','Arrived'],RECEIVED:['تم الاستلام','Received'],COMPLETED:['مكتمل','Completed'],REJECTED:['مرفوض','Rejected'],EXPIRED:['انتهت الصلاحية','Expired'],CANCELLED:['ملغي','Cancelled'],ACTIVE:['متاحة','Available'],RESERVED:['محجوزة بالكامل','Fully reserved'],DELETED:['محذوفة','Deleted']};return labels[status]?.[ar?0:1]??status;}
const answering=new Map<string,Promise<MealRequest>>();
export function answerReceipt(task:ReceiptTask,received:boolean){
 const key=`${task.id}:${received}`;const existing=answering.get(key);if(existing)return existing;
 if(received)prepareSuccessSound();
 const operation=(async()=>{const {data,error}=await supabase.rpc('answer_meal_receipt',{p_request_id:task.id,p_received:received});let row=(Array.isArray(data)?data[0]:data) as MealRequest|null;
  if(received&&(error||!row)){row=null;const saved=await supabase.from('meal_requests').select('*').eq('id',task.id).maybeSingle();if(!saved.error&&saved.data&&isReceived(saved.data as MealRequest))row=saved.data as MealRequest;}
  if(!row||row.id!==task.id||row.requester_id!==task.requester_id||row.pickup_meal_id!==task.pickup_meal_id||(received&&!isReceived(row))||(!received&&error))throw error??new Error('RECEIPT_NOT_CONFIRMED');
  if(received){publishMealRequestSaved(row);if(!isReceived(task))void playSuccessSoundOnce('received',row.id);}return row;
 })().finally(()=>answering.delete(key));answering.set(key,operation);return operation;
}
