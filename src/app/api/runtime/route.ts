import { NextResponse } from 'next/server'
import { getCurrentBuildId } from '@/lib/runtime-meta'

export async function GET() {
  const buildId = await getCurrentBuildId()
  const response = NextResponse.json(
    {
      buildId,
      now: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      },
    },
  )

  return response
}
