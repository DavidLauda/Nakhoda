/** Approximate opt-in presence on the server. Never return the input coordinates. */
export function snap250(lon:number,lat:number) {
  const y=lat*111320/250, x=lon*111320*Math.cos(lat*Math.PI/180)/250;
  const sy=Math.round(y)*250/111320;
  return {lat:Math.round(sy*1e6)/1e6,lon:Math.round(Math.round(x)*250/(111320*Math.cos(sy*Math.PI/180))*1e6)/1e6};
}
export function presenceIsFresh(heartbeatAt:string,nowMs:number) {
  const age=nowMs-Date.parse(heartbeatAt);
  return Number.isFinite(age)&&age>=0&&age<180000;
}

type Ring=number[][];
export type AreaGeometry={type:'Polygon';coordinates:Ring[]}|{type:'MultiPolygon';coordinates:Ring[][]};
type ZoneFeature={geometry:AreaGeometry;properties:{zoneType?:string}};
type LonLat={lon:number;lat:number};
function inRing(lon:number,lat:number,ring:Ring) {
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>lat)!==(yj>lat)&&lon<(xj-xi)*(lat-yi)/(yj-yi)+xi)inside=!inside;}
  return inside;
}
/** Ray casting; the first ring of each polygon is the outer boundary, the rest are holes. */
export function pointInArea(lon:number,lat:number,geometry:AreaGeometry) {
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.some(([outer,...holes])=>!!outer&&inRing(lon,lat,outer)&&!holes.some(h=>inRing(lon,lat,h)));
}
export function zoneAt<F extends ZoneFeature>(lon:number,lat:number,features:F[]):F|undefined {
  return features.find(f=>pointInArea(lon,lat,f.geometry));
}
function segmentTouchesBox(a:number[],b:number[],west:number,south:number,east:number,north:number) {
  let near=0,far=1;
  const dx=b[0]-a[0],dy=b[1]-a[1];
  for(const [p,q] of [[-dx,a[0]-west],[dx,east-a[0]],[-dy,a[1]-south],[dy,north-a[1]]]) {
    if(p===0){if(q<0)return false;continue;}
    const t=q/p;
    if(p<0)near=Math.max(near,t);else far=Math.min(far,t);
    if(near>far)return false;
  }
  return true;
}
/** Any contact counts, including a narrow polygon crossing a cell between sample points. */
export function cellIntersectsArea(cell:LonLat,half:number,geometry:AreaGeometry) {
  const west=cell.lon-half,east=cell.lon+half,south=cell.lat-half,north=cell.lat+half;
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.some(([outer])=>{
    if(!outer?.length)return false;
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    for(const [x,y] of outer){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
    if(maxX<west||minX>east||maxY<south||minY>north)return false;
    for(const [x,y] of [[west,south],[east,south],[west,north],[east,north]])if(pointInArea(x,y,geometry))return true;
    for(let i=0;i<outer.length;i++){
      const a=outer[i],b=outer[(i+1)%outer.length];
      if(a[0]>=west&&a[0]<=east&&a[1]>=south&&a[1]<=north)return true;
      if(segmentTouchesBox(a,b,west,south,east,north))return true;
    }
    return false;
  });
}
/** Return every intersecting zone so the most restrictive one can win. */
export function cellZoneTypes(cell:LonLat,half:number,features:ZoneFeature[]) {
  const types=new Set<string>();
  for(const feature of features)if(feature.properties.zoneType&&cellIntersectsArea(cell,half,feature.geometry))types.add(feature.properties.zoneType);
  return types;
}
const rad=(d:number)=>d*Math.PI/180;
export function distanceKm(a:LonLat,b:LonLat) {
  const h=Math.sin(rad(b.lat-a.lat)/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(rad(b.lon-a.lon)/2)**2;
  return 2*6371.0088*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function bearingDeg(a:LonLat,b:LonLat) {
  const y=Math.sin(rad(b.lon-a.lon))*Math.cos(rad(b.lat)),x=Math.cos(rad(a.lat))*Math.sin(rad(b.lat))-Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
export function compassId(deg:number) {
  return ['utara','timur laut','timur','tenggara','selatan','barat daya','barat','barat laut'][Math.round(((deg%360)+360)%360/45)%8];
}
