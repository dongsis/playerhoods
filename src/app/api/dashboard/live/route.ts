import { NextResponse } from 'next/server'
import { unstable_noStore as noStore } from 'next/cache'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { getMatchListData } from '@/lib/api/matches'
import { getUnreadNotificationCount } from '@/lib/api/notifications'

export async function GET() {
  noStore()

  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = await createSupabaseServerClient()

  const [items, inboxUnreadCount] = await Promise.all([
    getMatchListData(supabase, user.id).catch((error) => {
      console.error('[Dashboard live] match list:', error)
      return []
    }),
    getUnreadNotificationCount(supabase).catch((error) => {
      console.error('[Dashboard live] unread count:', error)
      return 0
    }),
  ])

  return NextResponse.json({
    items,
    inboxUnreadCount,
  })
}
