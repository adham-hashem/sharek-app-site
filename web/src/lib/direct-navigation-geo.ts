import { distanceKm, validCoordinates, type LocationFix } from './geo.ts';
import type { RoadPoint, RoadStep, WalkingRoute } from '../../supabase/functions/_shared/walking-route.ts';
export type { RoadPoint, RoadStep, WalkingRoute };
export const NAV_MAX_AGE_MS=15_000;
export function navigationIssue(fix:LocationFix,now=Date.now()):'stale'|'inaccurate'|'unavailable'|null {
 if(!validCoordinates(fix.latitude,fix.longitude))return 'unavailable';
 if(!Number.isFinite(fix.timestamp)||fix.timestamp>now+10_000||now-fix.timestamp>NAV_MAX_AGE_MS)return 'stale';
 if(!Number.isFinite(fix.accuracy)||fix.accuracy<0||fix.accuracy>50)return 'inaccurate';
 return null;
}
export function roadProgress(route:WalkingRoute,latitude:number,longitude:number){
 const latScale=111194.92664455874,lngScale=latScale*Math.cos(latitude*Math.PI/180);
 let best=Infinity,index=0,fraction=0;const lengths:number[]=[];
 for(let i=0;i<route.points.length-1;i++){
  const a=route.points[i],b=route.points[i+1];
  const ax=(a[1]-longitude)*lngScale,ay=(a[0]-latitude)*latScale,bx=(b[1]-longitude)*lngScale,by=(b[0]-latitude)*latScale;
  const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;
  const d=Math.hypot(ax+t*dx,ay+t*dy);if(d<best){best=d;index=i;fraction=t;}
  lengths.push(distanceKm(a[0],a[1],b[0],b[1])*1000);
 }
 const a=route.points[index],b=route.points[index+1];
 const projected:RoadPoint=[a[0]+fraction*(b[0]-a[0]),a[1]+fraction*(b[1]-a[1])];
 const geometryRemaining=lengths[index]*(1-fraction)+lengths.slice(index+1).reduce((sum,v)=>sum+v,0);
 const geometryLength=lengths.reduce((sum,v)=>sum+v,0),ratio=geometryLength?geometryRemaining/geometryLength:0;
 const seconds=route.segmentSeconds?route.segmentSeconds[index]*(1-fraction)+route.segmentSeconds.slice(index+1).reduce((sum,v)=>sum+v,0):route.duration*ratio;
 const step=route.steps.find(entry=>{
  const closest=nearestStepIndex(route.points,entry.location);
  return closest>index+fraction+.1;
 })??route.steps[route.steps.length-1]??null;
 return {offRouteMeters:best,index,fraction,remainingMeters:route.distance*ratio,remainingSeconds:seconds,
  remainingPoints:[projected,...route.points.slice(index+1)],completedPoints:[...route.points.slice(0,index+1),projected],step};
}
function nearestStepIndex(points:RoadPoint[],location:RoadPoint){
 let best=Infinity,index=0;for(let i=0;i<points.length;i++){const d=distanceKm(location[0],location[1],points[i][0],points[i][1]);if(d<best){best=d;index=i;}}return index;
}
export function maneuverText(step:RoadStep|null,ar:boolean){
 if(!step)return ar?'اتبع المسار الموضح على الخريطة':'Follow the route on the map';
 const modifier:Record<string,string>={'left':'يسارًا','right':'يمينًا','slight left':'يسارًا قليلًا','slight right':'يمينًا قليلًا','sharp left':'يسارًا بحدة','sharp right':'يمينًا بحدة','straight':'إلى الأمام','uturn':'للخلف'};
 let text=step.type==='arrive'?(ar?'توجّه إلى دبوس الطعام':'Continue to the food pin'):step.type==='depart'?(ar?'ابدأ السير على المسار':'Start walking along the route'):['roundabout','rotary'].includes(step.type)?(ar?'تابع عبر الدوار':'Continue through the roundabout'):ar?`تابع ${modifier[step.modifier]??'على المسار'}`:`Continue ${step.modifier||'along the route'}`;
 if(step.name)text+=ar?` عبر ${step.name}`:` on ${step.name}`;return text;
}
