'use client';
import { useEffect, useRef, useState } from 'react';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent, Marker, StyleSpecification } from 'maplibre-gl';

export type MapPin={id:string;lon:number;lat:number;kind:'observation'|'presence'|'cell'|'report';label:string};
export type MapAreaProperties={id:string;kind:'conservation'|'environment';name:string;zoneType?:string;score?:number;priority?:boolean;observedEnd?:string;sourceFeatureId?:number};
export type MapAreas=FeatureCollection<Polygon|MultiPolygon,MapAreaProperties>;
const defaultStyle:StyleSpecification={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
const emptyAreas:MapAreas={type:'FeatureCollection',features:[]};

export function MapView({pins,areas=emptyAreas,onPick,onSelect,onAreaSelect,userLocation}:{pins:MapPin[];areas?:MapAreas;onPick?:(lon:number,lat:number)=>void;onSelect?:(pin:MapPin)=>void;onAreaSelect?:(area:MapAreaProperties)=>void;userLocation?:{lon:number;lat:number;accuracy:number}|null}) {
  const element=useRef<HTMLDivElement>(null), map=useRef<MlMap|null>(null), markers=useRef<Marker[]>([]),locationMarker=useRef<Marker|null>(null),[mapReady,setMapReady]=useState(false);
  const style=process.env.NEXT_PUBLIC_MAP_STYLE_URL || defaultStyle;
  useEffect(()=>{if(!element.current)return;let disposed=false;
    import('maplibre-gl').then(({default:maplibre})=>{if(disposed||!element.current)return;const m=new maplibre.Map({container:element.current,style,center:[106.72,-5.77],zoom:8.25});m.addControl(new maplibre.NavigationControl(),'top-right');m.on('click',e=>onPick?.(e.lngLat.lng,e.lngLat.lat));map.current=m;setMapReady(true);});
    return()=>{disposed=true;locationMarker.current?.remove();locationMarker.current=null;map.current?.remove();map.current=null;};
  // Callbacks change without rebuilding map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[style]);
  useEffect(()=>{const m=map.current;if(!m)return;markers.current.forEach(x=>x.remove());markers.current=[];import('maplibre-gl').then(({default:maplibre})=>{if(!map.current)return;for(const pin of pins){const el=document.createElement('button');el.type='button';el.className=`map-pin ${pin.kind}`;el.title=pin.label;el.setAttribute('aria-label',pin.label);el.onclick=e=>{e.stopPropagation();onSelect?.(pin);};markers.current.push(new maplibre.Marker({element:el}).setLngLat([pin.lon,pin.lat]).addTo(m));}});return()=>{markers.current.forEach(x=>x.remove());markers.current=[];};},[pins,onSelect,mapReady]);
  useEffect(()=>{const m=map.current;if(!m)return;
    const install=()=>{
      const source=m.getSource('area-overlays') as GeoJSONSource|undefined;
      if(source)source.setData(areas);else m.addSource('area-overlays',{type:'geojson',data:areas});
      if(!m.getLayer('environment-fill'))m.addLayer({id:'environment-fill',type:'fill',source:'area-overlays',filter:['==',['get','kind'],'environment'],paint:{'fill-color':['case',['==',['get','priority'],true],'#14876b','#8fd0b4'],'fill-opacity':0.6}});
      if(!m.getLayer('environment-outline'))m.addLayer({id:'environment-outline',type:'line',source:'area-overlays',filter:['==',['get','kind'],'environment'],paint:{'line-color':'#0e5c3b','line-width':1.5,'line-opacity':0.8}});
      if(!m.getLayer('conservation-fill'))m.addLayer({id:'conservation-fill',type:'fill',source:'area-overlays',filter:['==',['get','kind'],'conservation'],paint:{'fill-color':['match',['get','zoneType'],'Inti','#c8553d','Perlindungan Bahari','#8a5a9e','Pemanfaatan','#f0c24b','#c8553d'],'fill-opacity':0.65}});
      if(!m.getLayer('conservation-outline'))m.addLayer({id:'conservation-outline',type:'line',source:'area-overlays',filter:['==',['get','kind'],'conservation'],paint:{'line-color':'#0b2a3c','line-width':2,'line-opacity':0.9}});
    };
    if(m.isStyleLoaded())install();else m.once('load',install);
    const selectConservation=(e:MapLayerMouseEvent)=>{const p=e.features?.[0]?.properties as MapAreaProperties|undefined;if(p)onAreaSelect?.(p);};
    const selectEnvironment=(e:MapLayerMouseEvent)=>{if(m.queryRenderedFeatures(e.point,{layers:['conservation-fill']}).length)return;const p=e.features?.[0]?.properties as MapAreaProperties|undefined;if(p)onAreaSelect?.(p);};
    m.on('click','conservation-fill',selectConservation);
    m.on('click','environment-fill',selectEnvironment);
    return()=>{m.off('load',install);m.off('click','conservation-fill',selectConservation);m.off('click','environment-fill',selectEnvironment);};
  },[areas,onAreaSelect,mapReady]);
  useEffect(()=>{if(!map.current)return;if(!userLocation){locationMarker.current?.remove();locationMarker.current=null;return;}let disposed=false;import('maplibre-gl').then(({default:maplibre})=>{if(disposed||!map.current)return;if(!locationMarker.current){const el=document.createElement('div');el.className='my-location-pin';el.setAttribute('aria-label','Lokasi GPS saya');locationMarker.current=new maplibre.Marker({element:el}).setLngLat([userLocation.lon,userLocation.lat]).addTo(map.current);}else locationMarker.current.setLngLat([userLocation.lon,userLocation.lat]);map.current.easeTo({center:[userLocation.lon,userLocation.lat],zoom:Math.max(map.current.getZoom(),12)});});return()=>{disposed=true;};},[userLocation,mapReady]);
  return <div ref={element} className="map-canvas" aria-label="Peta pilot Teluk Jakarta dan Kepulauan Seribu"/>;
}
