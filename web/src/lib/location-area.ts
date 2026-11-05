import {Capacitor,registerPlugin} from '@capacitor/core';
import {supabase} from './supabase';
export type AreaInfo={name:string|null;address?:string|null;countryCode?:string;district?:string|null;city?:string|null;state?:string|null;country?:string|null;canonicalId?:string;names?:{ar:string|null;en:string|null};latitude?:number;longitude?:number};
const LocationArea=registerPlugin<{resolve(options:{latitude:number;longitude:number;language:string}):Promise<AreaInfo>;search(options:{query:string;language:string}):Promise<{places:AreaInfo[]}>}>('LocationArea');
const cache=new Map<string,AreaInfo>(),pending=new Map<string,Promise<AreaInfo>>();
export async function resolveLocationAreaInfo(latitude:number,longitude:number,language:string):Promise<AreaInfo>{
 const key=`${language}:${latitude.toFixed(3)}:${longitude.toFixed(3)}`;try{const saved=JSON.parse(localStorage.getItem('sharek-geocode:'+key)??'null');if(saved?.info?.name&&Date.now()-saved.at<30*86400000)cache.set(key,saved.info);}catch{/* Optional cache must not prevent location lookup. */}if(cache.has(key))return cache.get(key)!;if(pending.has(key))return pending.get(key)!;
 const work=(async()=>{let info:AreaInfo={name:null};
 if(Capacitor.getPlatform()==='android')info=await LocationArea.resolve({latitude,longitude,language});
 else{const base=import.meta.env.VITE_REVERSE_GEOCODE_URL;if(!base)return info;const url=new URL(base);for(const [key,value] of Object.entries({format:'jsonv2',lat:String(latitude),lon:String(longitude),'accept-language':language,zoom:'14',addressdetails:'1'}))url.searchParams.set(key,value);const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)return info;const data=await response.json(),address=data.address??{},parts=[address.suburb??address.neighbourhood??address.quarter,address.city??address.town??address.village??address.county,address.state,address.country].filter(Boolean);info={name:[...new Set<string>(parts)].join('، ')||null,address:typeof data.display_name==='string'?data.display_name:null,district:address.suburb??address.neighbourhood,city:address.city??address.town,state:address.state,country:address.country,countryCode:address.country_code};}
 if(info.name){if(cache.size>=100)cache.clear();cache.set(key,info);try{localStorage.setItem('sharek-geocode:'+key,JSON.stringify({at:Date.now(),info}));}catch{/* Optional cache must not prevent location lookup. */}}return info;})();pending.set(key,work);try{return await work;}finally{pending.delete(key);}
}
export async function resolveLocationArea(latitude:number,longitude:number,language:string){return (await resolveLocationAreaInfo(latitude,longitude,language)).name;}
export async function searchLocationAreas(query:string,language:string,country?:string){
 if(!country||!/^[A-Za-z]{2}$/.test(country))throw new Error('COUNTRY_REQUIRED');
 const {data,error}=await supabase.functions.invoke('location-search',{body:{query,language,country}});
 if(!error&&Array.isArray(data?.places))return data.places as AreaInfo[];
 if(Capacitor.getPlatform()==='android'){
  const label=new Intl.DisplayNames([language],{type:'region'}).of(country.toUpperCase());
  const results=(await LocationArea.search({query:query+', '+label,language})).places;
  return results.filter(p=>p.countryCode?.toUpperCase()===country.toUpperCase()).map(p=>({...p,canonicalId:`geo:${p.countryCode}:${p.latitude?.toFixed(5)}:${p.longitude?.toFixed(5)}`}));
 }
 throw error??new Error('SEARCH_UNAVAILABLE');
}
