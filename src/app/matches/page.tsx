import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, getGameTypeLabel } from '@/lib/utils'
import { LogoutButton } from '@/components/LogoutButton'
import type { MatchDetails } from '@/types'

export default async function MatchesPage() {
  const supabase = await createClient()

  // 检查登录状态
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // 获取球局列表
  const { data: matches, error } = await supabase
    .from('match_details')
    .select('*')
    .eq('status', 'active')
    .order('scheduled_at', { ascending: true })

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="font-semibold text-xl">PlayerHoods</span>
          </Link>
          
          <div className="flex items-center gap-4">
            <Link
              href="/matches/create"
              className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors text-sm font-medium"
            >
              发起球局
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">球局列表</h1>

        {error ? (
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg">
            加载失败：{error.message}
          </div>
        ) : !matches || matches.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <p className="text-gray-500 mb-4">暂无球局</p>
            <Link 
              href="/matches/create"
              className="text-primary-500 hover:text-primary-600 font-medium"
            >
              发起第一个球局 →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {matches.map((match: MatchDetails) => (
              <MatchCard key={match.id} match={match} currentUserId={user.id} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function MatchCard({ match, currentUserId }: { match: MatchDetails; currentUserId: string }) {
  const isOrganizer = match.organizer_id === currentUserId
  
  return (
    <Link 
      href={`/matches/${match.id}`}
      className="block bg-white rounded-xl p-6 hover:shadow-md transition-shadow border border-gray-100"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* 类型标签 */}
          <div className="flex items-center gap-2 mb-2">
            <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded text-sm font-medium">
              {getGameTypeLabel(match.game_type, match.doubles_mode)}
            </span>
            {match.is_full && (
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-sm">
                已满员
              </span>
            )}
            {isOrganizer && (
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-sm">
                我发起的
              </span>
            )}
          </div>

          {/* 时间 */}
          <p className="text-lg font-semibold text-gray-900 mb-1">
            {match.scheduled_at ? formatDateTime(match.scheduled_at) : '时间待定'}
            {match.time_status === 'tentative' && (
              <span className="text-sm font-normal text-gray-500 ml-2">（暂定）</span>
            )}
          </p>

          {/* 地点 */}
          <p className="text-gray-600 mb-2">
            📍 {match.venue || '地点待定'}
            {match.venue_status === 'tentative' && (
              <span className="text-sm text-gray-400 ml-1">（暂定）</span>
            )}
          </p>

          {/* 组织者 */}
          <p className="text-sm text-gray-500">
            组织者：{match.organizer_name || '未知'}
          </p>
        </div>

        {/* 人数 */}
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">
            {match.confirmed_count}/{match.required_count}
          </p>
          <p className="text-sm text-gray-500">人</p>
        </div>
      </div>
    </Link>
  )
}
