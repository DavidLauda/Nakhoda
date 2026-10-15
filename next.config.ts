import type { NextConfig } from 'next';

const browserKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
let legacyServiceRole=false;
if(browserKey?.startsWith('eyJ')) {
  try { legacyServiceRole=JSON.parse(Buffer.from(browserKey.split('.')[1]||'','base64url').toString()).role==='service_role'; }
  catch { /* An invalid key will fail at Supabase, without being printed here. */ }
}
if(browserKey?.startsWith('sb_secret_') || legacyServiceRole) {
  throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY berisi kunci rahasia. Gunakan publishable key (sb_publishable_...) dan rotasi kunci rahasia yang terpapar.');
}
const nextConfig:NextConfig={outputFileTracingRoot:process.cwd()};
export default nextConfig;
