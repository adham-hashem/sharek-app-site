export type RoadPoint = [number, number]; // latitude, longitude
export type RoadStep = { name: string; type: string; modifier: string; location: RoadPoint; bearing: number | null };
export type WalkingRoute = { points: RoadPoint[]; distance: number; duration: number; segmentSeconds: number[] | null; steps: RoadStep[]; startOffset: number; endOffset: number };
const valid = (lat: unknown, lng: unknown) => typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
export function parseWalkingRoute(data: unknown): WalkingRoute {
 const body = data as {code?:string;routes?: Array<{distance:number;duration:number;geometry?:{coordinates:unknown[]};legs?:Array<{annotation?:{duration?:number[]};steps?:Array<{name?:string;mode?:string;maneuver?:{type?:string;modifier?:string;location?:number[];bearing_after?:number}}>}>}>;waypoints?:Array<{distance:number}>};
 const route=body?.routes?.[0],coords=route?.geometry?.coordinates;
 if(body?.code!=='Ok'||!route||!Number.isFinite(route.distance)||route.distance<0||!Number.isFinite(route.duration)||route.duration<0||!coords||coords.length<2||coords.length>50_000)throw new Error('ROUTE_UNAVAILABLE');
 const points:RoadPoint[]=coords.map(value=>{if(!Array.isArray(value)||!valid(value[1],value[0]))throw new Error('INVALID_ROUTE');return [value[1],value[0]];});
 const steps:RoadStep[]=[];
 for(const leg of route.legs??[])for(const step of leg.steps??[]){
  if(step.mode&& !['walking','foot','ferry'].includes(step.mode))throw new Error('NOT_A_WALKING_ROUTE');
  const m=step.maneuver;
  if(m?.location&&valid(m.location[1],m.location[0]))steps.push({name:step.name??'',type:m.type??'',modifier:m.modifier??'',location:[m.location[1],m.location[0]],bearing:Number.isFinite(m.bearing_after)?m.bearing_after!:null});
 }
 const seconds=(route.legs??[]).flatMap(leg=>leg.annotation?.duration??[]);
 const offsets=body.waypoints?.map(point=>point.distance)??[];
 if(offsets.length!==2||offsets.some(value=>!Number.isFinite(value)||value<0||value>100))throw new Error('PICKUP_NOT_REACHABLE');
 return {points,distance:route.distance,duration:route.duration,segmentSeconds:seconds.length===points.length-1&&seconds.every(n=>Number.isFinite(n)&&n>=0)?seconds:null,steps,startOffset:offsets[0],endOffset:offsets[1]};
}
