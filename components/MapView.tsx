'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as MlMap, Marker } from 'maplibre-gl';

export type MapPin={id:string;lon:number;lat:number;kind:'observation'|'presence'|'cell'|'report';label:string};
export function MapView({pins,onPick,onSelect}:{pins:MapPin[];onPick?:(lon:number,lat:number)=>void;onSelect?:(pin:MapPin)=>void}) {
  const element=useRef<HTMLDivElement>(null), map=useRef<MlMap|null>(null), markers=useRef<Marker[]>([]),[mapReady,setMapReady]=useState(false);
  const style=process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  useEffect(()=>{if(!style||!element.current)return;let disposed=false;
    import('maplibre-gl').then(({default:maplibre})=>{if(disposed||!element.current)return;const m=new maplibre.Map({container:element.current,style,center:[106.79,-5.85],zoom:9});m.addControl(new maplibre.NavigationControl(),'top-right');m.on('click',e=>onPick?.(e.lngLat.lng,e.lngLat.lat));map.current=m;setMapReady(true);});
    return()=>{disposed=true;map.current?.remove();map.current=null;};
  // Callbacks change without rebuilding map.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[style]);
  useEffect(()=>{const m=map.current;if(!m)return;markers.current.forEach(x=>x.remove());markers.current=[];import('maplibre-gl').then(({default:maplibre})=>{if(!map.current)return;for(const pin of pins){const el=document.createElement('button');el.type='button';el.className=`map-pin ${pin.kind}`;el.title=pin.label;el.setAttribute('aria-label',pin.label);el.onclick=e=>{e.stopPropagation();onSelect?.(pin);};markers.current.push(new maplibre.Marker({element:el}).setLngLat([pin.lon,pin.lat]).addTo(m));}});return()=>{markers.current.forEach(x=>x.remove());markers.current=[];};},[pins,onSelect,mapReady]);
  if(!style)return <div className="map-unavailable" role="status"><strong>Peta dasar belum dikonfigurasi.</strong><span>Daftar data di bawah tetap dapat digunakan. Tambahkan gaya peta berlisensi melalui NEXT_PUBLIC_MAP_STYLE_URL.</span></div>;
  return <div ref={element} className="map-canvas" aria-label="Peta pilot Teluk Jakarta dan Kepulauan Seribu"/>;
}
