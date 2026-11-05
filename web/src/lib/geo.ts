import { mealDeadline, type SharingMode } from './meal-sharing.ts';
export const MAX_LOCATION_AGE_MS = 120_000;
export const MAX_LOCATION_ACCURACY_M = 100;
export const DISCOVERY_RANGES_KM = [5, 15, 50] as const;
export type LocationFix = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export type LocationIssue = 'requesting' | 'denied' | 'unavailable' | 'inaccurate' | 'stale' | 'services_off';
export function validCoordinates(lat: number | null | undefined, lng: number | null | undefined): boolean {
 return lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
export function locationIssue(fix: LocationFix, now = Date.now()): LocationIssue | null {
 if (!validCoordinates(fix.latitude, fix.longitude)) return 'unavailable';
 if (!Number.isFinite(fix.timestamp) || fix.timestamp > now + 10_000 || now - fix.timestamp > MAX_LOCATION_AGE_MS) return 'stale';
 if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > MAX_LOCATION_ACCURACY_M) return 'inaccurate';
 return null;
}
export function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
 if (!validCoordinates(lat1,lng1) || !validCoordinates(lat2,lng2)) return NaN;
 const rad = Math.PI / 180, dLat = (lat2-lat1)*rad, dLng = (lng2-lng1)*rad;
 const a = Math.sin(dLat/2)**2 + Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(dLng/2)**2;
 return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1,Math.max(0,a))));
}
export function discoveryRange(nearest: number | undefined): number {
 return DISCOVERY_RANGES_KM.find(radius => nearest != null && nearest <= radius) ?? 50;
}
export function locationMessage(issue: LocationIssue | string | null, ar: boolean): string {
 if (issue==='services_off') return ar?'فعّل الموقع لتظهر لك الوجبات القريبة منك ❤️':'Turn on location to see meals near you ❤️';
 if (issue==='denied') return ar?'صلاحية الموقع مرفوضة. اسمح بالموقع الدقيق من إعدادات التطبيق.':'Location permission denied. Allow precise location in app settings.';
 if (issue==='inaccurate') return ar?'دقة الموقع ضعيفة. فعّل الموقع الدقيق وانتقل إلى مكان يسمح بإشارة GPS أفضل.':'Location accuracy is low. Enable precise location and seek a better GPS signal.';
 if (issue==='stale') return ar?'الموقع قديم. جارٍ انتظار قراءة GPS حديثة.':'Location is stale. Waiting for a fresh GPS fix.';
 if (issue==='requesting') return ar?'جارٍ تحديد موقعك الحقيقي…':'Finding your current location…';
 return ar?'تعذر تحديد الموقع. تأكد من تشغيل GPS وصلاحية الموقع.':'Location unavailable. Check GPS and location permission.';
}

export type GeoMeal = { id:string; status:string; quantity:number; expires_at:string; sharing_mode?:SharingMode; pickup_until?:string|null; availability_start?:string; latitude:number|null; longitude:number|null };
export function nearbyCommunityMeals<T extends GeoMeal>(rows:T[],lat:number|null,lng:number|null,now=Date.now(),maximumRadius?:number) {
 if(!validCoordinates(lat,lng))return [];
 const sorted=rows.filter(row=>row.status==='ACTIVE'&&row.quantity>0&&Date.parse(mealDeadline(row))>now
  &&(!row.availability_start||Date.parse(row.availability_start)<=now)&&validCoordinates(row.latitude,row.longitude))
  .map(row=>({...row,distance_km:distanceKm(lat!,lng!,row.latitude!,row.longitude!)}))
  .filter(row=>Number.isFinite(row.distance_km))
  .sort((a,b)=>a.distance_km-b.distance_km||a.id.localeCompare(b.id));
 const radius=maximumRadius??discoveryRange(sorted[0]?.distance_km);
 return sorted.filter(row=>row.distance_km<=radius);
}
