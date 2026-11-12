import {supabase} from './supabase';

// "رسالة الخير اليومية" — one push notification per day, scheduled on the server
// (public.send_daily_goodness via pg_cron). The app only stores the preference.
export type DailyGoodness={enabled:boolean;send_time:string;timezone:string};
export const DAILY_GOODNESS_DEFAULT:DailyGoodness={enabled:true,send_time:'10:00',timezone:'Africa/Cairo'};

export function deviceTimezone():string|null{
  try{const zone=Intl.DateTimeFormat().resolvedOptions().timeZone;return zone&&zone.length<=64?zone:null;}catch{return null;}
}

export async function loadDailyGoodness():Promise<DailyGoodness>{
  const {data,error}=await supabase.rpc('get_daily_goodness_settings');
  if(error||!data)throw error??new Error('DAILY_GOODNESS_UNAVAILABLE');
  return data as DailyGoodness;
}

export async function saveDailyGoodness(value:{enabled:boolean;send_time:string}):Promise<DailyGoodness>{
  const {data,error}=await supabase.rpc('set_daily_goodness_settings',{p_enabled:value.enabled,p_send_time:value.send_time,p_timezone:deviceTimezone()});
  if(error||!data)throw error??new Error('DAILY_GOODNESS_UNAVAILABLE');
  return data as DailyGoodness;
}

// Keeps delivery at the chosen local time when the phone's timezone changes. Best effort.
export function syncDailyGoodnessTimezone():void{
  const zone=deviceTimezone();if(!zone)return;
  try{if(sessionStorage.getItem('sharek-goodness-tz')===zone)return;}catch{/* storage blocked */}
  void supabase.rpc('sync_daily_goodness_timezone',{p_timezone:zone}).then(({error})=>{if(!error)try{sessionStorage.setItem('sharek-goodness-tz',zone);}catch{/* storage blocked */}});
}
