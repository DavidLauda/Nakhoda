import type { Metadata, Viewport } from 'next';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/plus-jakarta-sans';
import './globals.css';

export const metadata:Metadata={title:'Nakhoda',description:'Peta kondisi perairan untuk nelayan dan dasbor ekosistem untuk pemerintah di Kepulauan Seribu',manifest:'/manifest.webmanifest',appleWebApp:{capable:true,title:'Nakhoda',statusBarStyle:'default'}};
export const viewport:Viewport={width:'device-width',initialScale:1,themeColor:'#0b2a3c'};
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="id"><body>{children}</body></html>; }
