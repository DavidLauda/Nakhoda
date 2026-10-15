import { NextRequest } from 'next/server';
import { handleApi } from '@/lib/api';

export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: {params: Promise<{path:string[]}>}) { return handleApi(request,'GET',(await context.params).path); }
export async function POST(request: NextRequest, context: {params: Promise<{path:string[]}>}) { return handleApi(request,'POST',(await context.params).path); }
export async function PATCH(request: NextRequest, context: {params: Promise<{path:string[]}>}) { return handleApi(request,'PATCH',(await context.params).path); }
export async function DELETE(request: NextRequest, context: {params: Promise<{path:string[]}>}) { return handleApi(request,'DELETE',(await context.params).path); }
