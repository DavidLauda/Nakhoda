import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest {return {name:'Nakhoda — Intelijen pesisir',short_name:'Nakhoda',description:'Pilot observasi pesisir dan laporan lapangan',start_url:'/map',display:'standalone',background_color:'#f4f8f8',theme_color:'#0e5574',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'maskable'}]};}
