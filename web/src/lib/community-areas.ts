import {supabase} from './supabase';
import {countryAlpha3} from './country-codes';
import type {CommunityArea} from './community-filters';
export type BoundaryDataset={country:string;level:string;features:CommunityArea[];source:string;sourceUrl:string;license:string;year:string};
const cache=new Map<string,BoundaryDataset>(),pending=new Map<string,Promise<BoundaryDataset>>();
export async function communityAreas(country:string):Promise<BoundaryDataset>{
 const upper=country.toUpperCase(),code=countryAlpha3[upper]??upper;if(!/^[A-Z]{3}$/.test(code))throw Error('BOUNDARIES_UNAVAILABLE');if(cache.has(code))return cache.get(code)!;if(pending.has(code))return pending.get(code)!;
 const work=(async()=>{const {data,error}=await supabase.functions.invoke('community-boundaries',{body:{country:code}});if(error||!data?.features?.length)throw error??Error('BOUNDARIES_UNAVAILABLE');cache.set(code,data);return data as BoundaryDataset;})();pending.set(code,work);try{return await work;}finally{pending.delete(code);}
}
