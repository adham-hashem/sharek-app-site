import {Capacitor,registerPlugin} from '@capacitor/core';
import {supabase} from './supabase';
export const MEAL_LINK_ORIGIN='https://www.sharek.space';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NativeMealShare=registerPlugin<{share(options:{title:string;text:string;url:string;chooserTitle:string}):Promise<void>}>('MealShare');
export function parseMealLink(raw:string):string|null{
 try{const url=new URL(raw);if(url.protocol==='https:'&&url.hostname==='www.sharek.space')return uuid.test(url.pathname.split('/')[2]??'')&&url.pathname.split('/')[1]==='meals'?url.pathname.split('/')[2]:null;
 if(url.protocol==='com.sharek.foodsharing:'&&url.hostname==='meal'){const token=url.pathname.split('/')[1];return uuid.test(token)?token:null;}}catch{}return null;
}
export async function createMealShare(mealId:string){
 const {data,error}=await supabase.rpc('get_or_create_meal_share',{p_meal_id:mealId});
 if(error||data?.meal_id!==mealId||!uuid.test(data.token))throw error??new Error('SHARE_LINK_UNAVAILABLE');
 return {title:`${data.name} — SHARek`,text:`${data.name}\n${data.description??''}`,url:`${MEAL_LINK_ORIGIN}/meals/${data.token}`};
}
export async function openMealShareSheet(share:{title:string;text:string;url:string},ar:boolean){
 if(Capacitor.getPlatform()==='android'){await NativeMealShare.share({...share,chooserTitle:ar?'مشاركة الوجبة':'Share meal'});return true;}
 if(navigator.share){await navigator.share(share);return true;}return false;
}
