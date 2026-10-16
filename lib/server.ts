import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export type Role = 'fisherman' | 'reviewer' | 'admin';
export type Identity = { id: string; role: Role; displayName: string; isAnonymous: boolean; portal: 'fisherman' | 'government' };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryable = false) { super(message); }
}

function config(name: string) {
  const value = process.env[name];
  if (!value) throw new ApiError(503, 'integration_unavailable', `${name} belum dikonfigurasi.`);
  return value;
}

export function serviceDb(): SupabaseClient {
  return createClient(config('NEXT_PUBLIC_SUPABASE_URL'), config('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function identity(request: NextRequest): Promise<Identity> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new ApiError(401, 'unauthenticated', 'Masuk untuk melanjutkan.');
  const client = createClient(config('NEXT_PUBLIC_SUPABASE_URL'), config('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error } = await client.auth.getUser(token);
  if (error || !auth.user) throw new ApiError(401, 'invalid_session', 'Sesi tidak valid. Masuk kembali.');
  const { data, error: profileError } = await serviceDb().from('profiles').select('role,display_name').eq('id', auth.user.id).single();
  if (profileError || !data) throw new ApiError(403, 'missing_profile', 'Profil akun belum tersedia.');
  const quickLogin = auth.user.is_anonymous === true;
  const portal = quickLogin ? (auth.user.user_metadata?.portal === 'government' ? 'government' : 'fisherman') : data.role === 'fisherman' ? 'fisherman' : 'government';
  // Quick-entry government sessions review the pilot area only while the server flag is on (judging window).
  const quickRole: Role = portal === 'government' && process.env.QUICK_LOGIN_FULL_ACCESS === 'true' ? 'reviewer' : 'fisherman';
  return { id: auth.user.id, role: quickLogin ? quickRole : data.role as Role, displayName: quickLogin ? (portal === 'government' ? 'Akses Pemerintah' : 'Akses Nelayan') : data.display_name, isAnonymous: quickLogin, portal };
}

export async function reviewer(user: Identity, areaId: string) {
  if (user.role === 'admin') return;
  if (user.role !== 'reviewer') throw new ApiError(403, 'role_forbidden', 'Akses peninjau diperlukan.');
  if (user.isAnonymous) {
    if (areaId !== await pilotAreaId()) throw new ApiError(403, 'area_forbidden', 'Akun tidak ditugaskan ke area ini.');
    return;
  }
  const { data } = await serviceDb().from('area_memberships').select('area_id').eq('user_id', user.id).eq('area_id', areaId).maybeSingle();
  if (!data) throw new ApiError(403, 'area_forbidden', 'Akun tidak ditugaskan ke area ini.');
}

export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } }); }
export function failure(error: unknown) {
  if (error instanceof ApiError) return json({ error: { code: error.code, message: error.message, retryable: error.retryable } }, error.status);
  console.error('api_error', error instanceof Error ? error.message : 'unknown');
  return json({ error: { code: 'internal_error', message: 'Layanan gagal. Coba lagi nanti.', retryable: true } }, 500);
}
export function assertDb(error: { message: string } | null, context: string): void {
  if (error) throw new ApiError(500, 'database_error', `${context}: ${error.message}`, true);
}
export function validPoint(lon: number, lat: number) {
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) throw new ApiError(422, 'invalid_location', 'Koordinat tidak valid.');
}
export function validPilotPoint(lon: number, lat: number) {
  validPoint(lon, lat);
  if (lon < 106.35 || lon > 107.10 || lat < -6.20 || lat > -5.35) throw new ApiError(422, 'outside_pilot', 'Lokasi di luar area pilot.');
}
export function timestamp(value: string, maxFutureMinutes = 5) {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || ms > Date.now() + maxFutureMinutes * 60000 || ms < Date.now() - 366 * 86400000) throw new ApiError(422, 'invalid_time', 'Waktu pengamatan tidak valid.');
  return new Date(ms).toISOString();
}
export function bbox(value: string | null): [number, number, number, number] {
  if (!value) return [106.35, -6.20, 107.10, -5.35];
  const b = value.split(',').map(Number);
  if (b.length !== 4 || b.some(x => !Number.isFinite(x)) || b[0] >= b[2] || b[1] >= b[3] || b[2]-b[0] > 2 || b[3]-b[1] > 2) throw new ApiError(422, 'invalid_bbox', 'Batas peta tidak valid.');
  return b as [number, number, number, number];
}
export function inBbox(lon: number, lat: number, b: [number,number,number,number]) { return lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]; }
export async function pilotAreaId(): Promise<string> {
  const { data, error } = await serviceDb().from('study_areas').select('id').eq('code','pilot').single();
  assertDb(error, 'Area pilot');
  return data!.id;
}
