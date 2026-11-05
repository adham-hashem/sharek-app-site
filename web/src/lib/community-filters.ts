import {distanceKm,validCoordinates,type GeoMeal} from './geo.ts';
export type BoundaryGeometry={type:'Polygon';coordinates:number[][][]}|{type:'MultiPolygon';coordinates:number[][][][]};
export type CommunityArea={id:string;name:string;geometry:BoundaryGeometry};
export type CommunityOrigin={latitude:number;longitude:number;name:string|null;countryCode?:string;canonicalId?:string;names?:{ar:string|null;en:string|null}};
export type CommunityScope='nearby'|'same'|'other'|'all';
export function insideBoundary(latitude:number,longitude:number,geometry:BoundaryGeometry){
 const ring=(points:number[][])=>{let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const [xi,yi]=points[i],[xj,yj]=points[j];const cross=(longitude-xi)*(yj-yi)-(latitude-yi)*(xj-xi);if(Math.abs(cross)<1e-10&&longitude>=Math.min(xi,xj)-1e-10&&longitude<=Math.max(xi,xj)+1e-10&&latitude>=Math.min(yi,yj)-1e-10&&latitude<=Math.max(yi,yj)+1e-10)return true;if((yi>latitude)!==(yj>latitude)&&longitude<(xj-xi)*(latitude-yi)/(yj-yi)+xi)inside=!inside;}return inside;};
 const polygon=(rings:number[][][])=>rings.length>0&&ring(rings[0])&&!rings.slice(1).some(ring);
 return validCoordinates(latitude,longitude)&&(geometry.type==='Polygon'?polygon(geometry.coordinates):geometry.coordinates.some(polygon));
}
export function findCommunityArea(areas:CommunityArea[],lat:number,lng:number){return areas.find(area=>insideBoundary(lat,lng,area.geometry))??null;}
export function filterCommunityMeals<T extends GeoMeal>(rows:T[],origin:CommunityOrigin|null,user:CommunityOrigin|null,radius:number,scope:CommunityScope,area:CommunityArea|null,now=Date.now()){
 if(!origin||!validCoordinates(origin.latitude,origin.longitude))return [];
 const maximum=Math.min(50,Math.max(0,radius));
 return rows.filter(row=>row.status==='ACTIVE'&&row.quantity>0&&Date.parse(row.pickup_until??row.expires_at)>now&&Date.parse(row.expires_at)>now&&(!row.availability_start||Date.parse(row.availability_start)<=now)&&validCoordinates(row.latitude,row.longitude))
  .map(row=>({...row,search_distance_km:distanceKm(origin.latitude,origin.longitude,row.latitude!,row.longitude!),distance_km:user?distanceKm(user.latitude,user.longitude,row.latitude!,row.longitude!):distanceKm(origin.latitude,origin.longitude,row.latitude!,row.longitude!)}))
  .filter(row=>row.search_distance_km<=maximum&&(scope!=='same'||Boolean(area&&insideBoundary(row.latitude!,row.longitude!,area.geometry))))
  .sort((a,b)=>a.distance_km-b.distance_km||a.id.localeCompare(b.id));
}
export function areaSearchOrigin(area:CommunityArea):CommunityOrigin{
 const polygons=area.geometry.type==='Polygon'?[area.geometry.coordinates]:area.geometry.coordinates;
 const ring=polygons.reduce((largest,current)=>current[0].length>largest.length?current[0]:largest,[] as number[][]);
 // A point actually on the published administrative boundary is a valid search anchor.
 // Prefer an interior centroid; fall back to a real polygon vertex for concave shapes.
 let twiceArea=0,x=0,y=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const cross=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];twiceArea+=cross;x+=(ring[j][0]+ring[i][0])*cross;y+=(ring[j][1]+ring[i][1])*cross;}
 const longitude=x/(3*twiceArea),latitude=y/(3*twiceArea);return Number.isFinite(latitude)&&insideBoundary(latitude,longitude,area.geometry)?{latitude,longitude,name:area.name}:{latitude:ring[0][1],longitude:ring[0][0],name:area.name};
}
