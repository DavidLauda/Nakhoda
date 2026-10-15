import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata:Metadata={title:'Nakhoda',description:'Observasi pesisir dan laporan lapangan untuk pilot Teluk Jakarta dan Kepulauan Seribu',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Nakhoda',statusBarStyle:'default'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#0e5574'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="id"><body>{children}</body></html>; }
