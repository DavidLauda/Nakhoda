import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest {
  return {
    id:'/',
    name:'Nakhoda — Peta nelayan & ekosistem',
    short_name:'Nakhoda',
    description:'Peta kondisi perairan untuk nelayan dan dasbor ekosistem untuk pemerintah',
    lang:'id',
    start_url:'/',
    scope:'/',
    display:'standalone',
    background_color:'#eef4f5',
    theme_color:'#0b2a3c',
    prefer_related_applications:false,
    icons:[
      {src:'/icons/pwa-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/icons/pwa-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/icons/pwa-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
    ],
  };
}
