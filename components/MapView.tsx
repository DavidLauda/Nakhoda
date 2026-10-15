'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, Marker, StyleSpecification } from 'maplibre-gl';

export type MapPin={id:string;lon:number;lat:number;kind:'observation'|'presence'|'cell'|'report';label:string};
const defaultStyle:StyleSpecification={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
export function MapView({pins,onPick,onSelect,userLocation}:{pins:MapPin[];onPick?:(lon:number,lat:number)=>void;onSelect?:(pin:MapPin)=>void;userLocation?:{lon:number;lat:number;accuracy:number}|null}) {
  const element=useRef<HTMLDivElement>(null), map=useRef<MlMap|null>(null), markers=useRef<Marker[]>([]),locationMarker=useRef<Marker|null>(null),[mapReady,setMapReady]=useState(false);
  const style=process.env.NEXT_PUBLIC_MAP_STYLE_URL || defaultStyle;
  useEffect(()=>{if(!element.current)return;let disposed=false;
    import('maplibre-gl').then(({default:maplibre})=>{if(disposed||!element.current)return;const m=new maplibre.Map({container:element.current,style,center:[106.79,-5.85],zoom:9});m.addControl(new maplibre.NavigationControl(),'top-right');m.on('click',e=>onPick?.(e.lngLat.lng,e.lngLat.lat));map.current=m;setMapReady(true);});
    return()=>{disposed=true;locationMarker.current?.remove();locationMarker.current=null;map.current?.remove();map.current=null;};
  // Callbacks change without rebuilding map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[style]);
  useEffect(()=>{const m=map.current;if(!m)return;markers.current.forEach(x=>x.remove());markers.current=[];import('maplibre-gl').then(({default:maplibre})=>{if(!map.current)return;for(const pin of pins){const el=document.createElement('button');el.type='button';el.className=`map-pin ${pin.kind}`;el.title=pin.label;el.setAttribute('aria-label',pin.label);el.onclick=e=>{e.stopPropagation();onSelect?.(pin);};markers.current.push(new maplibre.Marker({element:el}).setLngLat([pin.lon,pin.lat]).addTo(m));}});return()=>{markers.current.forEach(x=>x.remove());markers.current=[];};},[pins,onSelect,mapReady]);
  useEffect(()=>{if(!map.current)return;if(!userLocation){locationMarker.current?.remove();locationMarker.current=null;return;}let disposed=false;import('maplibre-gl').then(({default:maplibre})=>{if(disposed||!map.current)return;if(!locationMarker.current){const el=document.createElement('div');el.className='my-location-pin';el.setAttribute('aria-label','Lokasi GPS saya');locationMarker.current=new maplibre.Marker({element:el}).setLngLat([userLocation.lon,userLocation.lat]).addTo(map.current);}else locationMarker.current.setLngLat([userLocation.lon,userLocation.lat]);map.current.easeTo({center:[userLocation.lon,userLocation.lat],zoom:Math.max(map.current.getZoom(),12)});});return()=>{disposed=true;};},[userLocation,mapReady]);
  return <div ref={element} className="map-canvas" aria-label="Peta pilot Teluk Jakarta dan Kepulauan Seribu"/>;
}
