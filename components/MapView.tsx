'use client';
import { useEffect, useRef, useState } from 'react';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { ExpressionSpecification, GeoJSONSource, Map as MlMap, MapLayerMouseEvent, Marker, StyleSpecification } from 'maplibre-gl';

export type MapPin={id:string;lon:number;lat:number;kind:'observation'|'presence'|'cell'|'report';label:string;count?:number};
export type MapAreaProperties={id:string;kind:'conservation'|'environment'|'problem';level?:'problem'|'watch';name:string;category?:'high'|'moderate'|'caution'|'avoid'|'unknown';zoneType?:string;score?:number;priority?:boolean;observedEnd?:string;sourceFeatureId?:number|string;coverage?:'measured'|'estimate'|'unknown';sourceCellId?:string;sourceResolution?:string;lon?:number;lat?:number};
export type MapAreas=FeatureCollection<Polygon|MultiPolygon,MapAreaProperties>;
const defaultStyle:StyleSpecification={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
const emptyAreas:MapAreas={type:'FeatureCollection',features:[]};
const areaFillColor:ExpressionSpecification=['match',['get','category'],'high','#14876b','moderate','#8fd0b4','avoid','#c8553d','unknown','#cbd5e1','#f0c24b'];
const areaOutlineColor:ExpressionSpecification=['match',['get','category'],'high','#0e5c3b','moderate','#0e5c3b','avoid','#7a2a18','unknown','#94a3b8','#8a6b16'];
const areaOutlineWidth:ExpressionSpecification=['interpolate',['linear'],['zoom'],6,0,8,0.15,10,0.5,12,1];
// MapLibre sets `style` to null after a WebGL context loss (common in Safari) and restores it later.
const styleReady=(m:MlMap|null):m is MlMap=>!!m&&!!m.style&&m.isStyleLoaded()===true;
const selectedFilter=(id?:string)=>['==',['get','id'],id??''] as ['==',['get',string],string];
function applySelected(m:MlMap|null,id?:string){if(styleReady(m)&&m.getLayer('environment-selected'))m.setFilter('environment-selected',selectedFilter(id));}

export function MapView({pins,areas=emptyAreas,onPick,onSelect,onAreaSelect,userLocation,selectedId,focus}:{pins:MapPin[];areas?:MapAreas;onPick?:(lon:number,lat:number)=>void;onSelect?:(pin:MapPin)=>void;onAreaSelect?:(area:MapAreaProperties)=>void;userLocation?:{lon:number;lat:number;accuracy:number}|null;selectedId?:string;focus?:{lon:number;lat:number}|null}) {
  const element=useRef<HTMLDivElement>(null), map=useRef<MlMap|null>(null), markers=useRef<Marker[]>([]),locationMarker=useRef<Marker|null>(null),selectedRef=useRef(selectedId),appliedAreas=useRef<MapAreas|null>(null),[mapReady,setMapReady]=useState(false);
  const style=process.env.NEXT_PUBLIC_MAP_STYLE_URL || defaultStyle;
  useEffect(()=>{if(!element.current)return;let disposed=false;
    import('maplibre-gl').then(({default:maplibre})=>{if(disposed||!element.current)return;const m=new maplibre.Map({container:element.current,style,center:[106.72,-5.77],zoom:8.25});m.addControl(new maplibre.NavigationControl(),'top-right');m.on('click',e=>onPick?.(e.lngLat.lng,e.lngLat.lat));appliedAreas.current=null;map.current=m;setMapReady(true);});
    return()=>{disposed=true;locationMarker.current?.remove();locationMarker.current=null;map.current?.remove();map.current=null;};
  // Callbacks change without rebuilding map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[style]);
  useEffect(()=>{if(!map.current)return;markers.current.forEach(x=>x.remove());markers.current=[];import('maplibre-gl').then(({default:maplibre})=>{if(!map.current)return;for(const pin of pins){const el=document.createElement('button');el.type='button';el.className=`map-pin ${pin.kind}${pin.count?' with-count':''}`;if(pin.count)el.textContent=String(pin.count);el.title=pin.label;el.setAttribute('aria-label',pin.label);el.onclick=e=>{e.stopPropagation();onSelect?.(pin);};markers.current.push(new maplibre.Marker({element:el}).setLngLat([pin.lon,pin.lat]).addTo(map.current));}});return()=>{markers.current.forEach(x=>x.remove());markers.current=[];};},[pins,onSelect,mapReady]);
  useEffect(()=>{const m=map.current;if(!m)return;
    const install=()=>{
      if(!styleReady(m))return;
      const source=m.getSource('area-overlays') as GeoJSONSource|undefined;
      if(!source)m.addSource('area-overlays',{type:'geojson',data:areas});else if(appliedAreas.current!==areas)source.setData(areas);
      appliedAreas.current=areas;
      if(!m.getLayer('environment-fill'))m.addLayer({id:'environment-fill',type:'fill',source:'area-overlays',filter:['==',['get','kind'],'environment'],paint:{'fill-color':areaFillColor,'fill-opacity':0.35}});
      if(!m.getLayer('environment-outline'))m.addLayer({id:'environment-outline',type:'line',source:'area-overlays',filter:['==',['get','kind'],'environment'],paint:{'line-color':areaOutlineColor,'line-width':areaOutlineWidth,'line-opacity':0.4}});
      if(!m.getLayer('conservation-fill'))m.addLayer({id:'conservation-fill',type:'fill',source:'area-overlays',filter:['==',['get','kind'],'conservation'],paint:{'fill-color':areaFillColor,'fill-opacity':0.35}});
      if(!m.getLayer('environment-selected'))m.addLayer({id:'environment-selected',type:'line',source:'area-overlays',filter:selectedFilter(selectedRef.current),paint:{'line-color':'#0b2a3c','line-width':3.5}});
      if(!m.getLayer('problem-fill'))m.addLayer({id:'problem-fill',type:'fill',source:'area-overlays',filter:['==',['get','kind'],'problem'],paint:{'fill-color':['match',['get','level'],'problem','#c8553d','#f0c24b'],'fill-opacity':0.6}});
      if(!m.getLayer('problem-outline'))m.addLayer({id:'problem-outline',type:'line',source:'area-overlays',filter:['==',['get','kind'],'problem'],paint:{'line-color':'#0b2a3c','line-width':1,'line-opacity':0.5}});
      if(!m.getLayer('conservation-outline'))m.addLayer({id:'conservation-outline',type:'line',source:'area-overlays',filter:['==',['get','kind'],'conservation'],paint:{'line-color':areaOutlineColor,'line-width':areaOutlineWidth,'line-opacity':0.4}});
      applySelected(m,selectedRef.current);
    };
    // Re-runs when a style (re)loads or the map settles, including after context restoration; install is idempotent.
    install();m.on('styledata',install);m.on('idle',install);
    const selectConservation=(e:MapLayerMouseEvent)=>{const p=e.features?.[0]?.properties as MapAreaProperties|undefined;if(p)onAreaSelect?.(p);};
    const selectEnvironment=(e:MapLayerMouseEvent)=>{if(!m.style)return;if(m.queryRenderedFeatures(e.point,{layers:['conservation-fill']}).length)return;const p=e.features?.[0]?.properties as MapAreaProperties|undefined;if(p)onAreaSelect?.(p);};
    m.on('click','conservation-fill',selectConservation);
    m.on('click','environment-fill',selectEnvironment);
    m.on('click','problem-fill',selectConservation);
    return()=>{m.off('styledata',install);m.off('idle',install);m.off('click','conservation-fill',selectConservation);m.off('click','environment-fill',selectEnvironment);m.off('click','problem-fill',selectConservation);};
  },[areas,onAreaSelect,mapReady]);
  useEffect(()=>{selectedRef.current=selectedId;applySelected(map.current,selectedId);},[selectedId,mapReady]);
  useEffect(()=>{if(focus&&map.current)map.current.easeTo({center:[focus.lon,focus.lat],zoom:Math.max(map.current.getZoom(),10)});},[focus,mapReady]);
  useEffect(()=>{if(!map.current)return;if(!userLocation){locationMarker.current?.remove();locationMarker.current=null;return;}let disposed=false;import('maplibre-gl').then(({default:maplibre})=>{if(disposed||!map.current)return;if(!locationMarker.current){const el=document.createElement('div');el.className='my-location-pin';el.setAttribute('aria-label','Lokasi GPS saya');locationMarker.current=new maplibre.Marker({element:el}).setLngLat([userLocation.lon,userLocation.lat]).addTo(map.current);}else locationMarker.current.setLngLat([userLocation.lon,userLocation.lat]);map.current.easeTo({center:[userLocation.lon,userLocation.lat],zoom:Math.max(map.current.getZoom(),12)});});return()=>{disposed=true;};},[userLocation,mapReady]);
  return <div ref={element} className="map-canvas" aria-label="Peta pilot Teluk Jakarta dan Kepulauan Seribu"/>;
}
