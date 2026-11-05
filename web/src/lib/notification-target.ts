import {supabase} from './supabase';
export async function notificationTarget(type:string,id:string,_isDonor:boolean){
 void _isDonor; // Ownership is checked by the server for either account role.
 if(['meal_request','meal'].includes(type)){
  const {data,error}=await supabase.rpc('resolve_normal_meal_notification',{p_related_type:type,p_related_id:id});if(error)throw error;
  if(data?.meal_id)return {screen:'management' as const,mealId:data.meal_id as string,requestId:data.request_id as string|undefined};
 }
 if(type==='chat')return {screen:'chat' as const,id};
 if(type==='meal_request')return {screen:'request' as const,id};
 if(type==='meal')return {screen:'meal' as const,id};
 return {screen:'community' as const,id};
}
