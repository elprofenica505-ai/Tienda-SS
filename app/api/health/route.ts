import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'tienda-ss',
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}
