import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, getGameTypeLabel, formatTimeRange } from '@/lib/utils'
import { LogoutButton } from '@/components/LogoutButton'
import type { MatchDetails, ParticipantWithProfile, GameType } from '@/types'

// 扩展类型，包含参与者信息
interface MatchWithParticipants extends MatchDetails {
  participants: ParticipantWithProfile[]
  pendingCount: number
  isRemoved?: boolean // 当前用户是否被移除
}

// 获取默认时长（分钟）
function getDefaultDuration(gameType: GameType): number {
  return gameType === 'singles' ? 60 : 90
}

export default async function MatchesPage() {
  const supabase = await createClient()

  // 检查登录状态
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // 获取用户所有参与过的球局（包括被移除的）
  const { data: myParticipations } = await supabase
    .from('participants')
    .select('match_id, state')
    .eq('user_id', user.id)

  const myMatchIds = myParticipations?.map(p => p.match_id) || []
  // 记录被移除的球局ID
  const removedMatchIds = new Set(
    myParticipations?.filter(p => p.state === 'removed').map(p => p.match_id) || []
  )

  // 获取球局列表（显示用户参与过的所有球局）
  let matches: MatchDetails[] | null = null
  let error = null

  if (myMatchIds.length > 0) {
    const result = await supabase
      .from('match_details')
      .select('*')
      .eq('status', 'active')
      .in('id', myMatchIds)
      .order('scheduled_at', { ascending: true })
    matches = result.data
    error = result.error
  }

  // 获取所有球局的参与者
  let matchesWithParticipants: MatchWithParticipants[] = []
  if (matches && matches.length > 0) {
    const matchIds = matches.map(m => m.id)
    const { data: allParticipants } = await supabase
      .from('participants')
      .select(`
        *,
        profile:profiles(*)
      `)
      .in('match_id', matchIds)
      .neq('state', 'removed')
      .order('created_at', { ascending: true })

    // 将参与者分配到各个球局
    matchesWithParticipants = matches.map(match => {
      const participants = allParticipants?.filter(p => p.match_id === match.id) || []
      const pendingCount = participants.filter(p => p.state === 'pending').length
      return {
        ...match,
        participants,
        pendingCount,
        isRemoved: removedMatchIds.has(match.id),
      }
    })
  }

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
        ) : matchesWithParticipants.length === 0 ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <p className="text-gray-500 mb-4">暂无参与的球局</p>
            <Link
              href="/matches/create"
              className="text-primary-500 hover:text-primary-600 font-medium"
            >
              发起第一个球局 →
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {matchesWithParticipants.map((match) => (
              <MatchCard key={match.id} match={match} currentUserId={user.id} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

function MatchCard({ match, currentUserId }: { match: MatchWithParticipants; currentUserId: string }) {
  const isOrganizer = match.organizer_id === currentUserId
  const confirmedParticipants = match.participants.filter(p => p.state === 'confirmed')
  const pendingParticipants = match.participants.filter(p => p.state === 'pending')

  // 被移除的球局显示特殊卡片
  if (match.isRemoved) {
    return (
      <div className="block bg-gray-50 rounded-xl p-6 border border-gray-200 opacity-75">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* 类型标签 */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="bg-gray-200 text-gray-600 px-2 py-1 rounded text-sm font-medium">
                {getGameTypeLabel(match.game_type, match.doubles_mode)}
              </span>
            </div>

            {/* 时间 */}
            <p className="text-lg font-semibold text-gray-500 mb-1">
              {match.scheduled_at ? formatDateTime(match.scheduled_at) : '时间待定'}
              {match.scheduled_at && (
                <span className="text-sm font-normal text-gray-400 ml-2">
                  {formatTimeRange(match.scheduled_at, match.duration_minutes || getDefaultDuration(match.game_type))}
                </span>
              )}
            </p>

            {/* 地点 */}
            <p className="text-gray-400 mb-3">
              {match.venue || '地点待定'}
            </p>

            {/* 提示信息 */}
            <div className="bg-orange-50 text-orange-700 px-3 py-2 rounded-lg text-sm">
              该场次的安排已更新，你当前不在该场次的参与名单中
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Link
      href={`/matches/${match.id}`}
      className="block bg-white rounded-xl p-6 hover:shadow-md transition-shadow border border-gray-100"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* 类型标签 */}
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="bg-primary-100 text-primary-700 px-2 py-1 rounded text-sm font-medium">
              {getGameTypeLabel(match.game_type, match.doubles_mode)}
            </span>
            {match.is_formed && (
              <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-sm">
                已成局
              </span>
            )}
            {match.is_full && !match.is_formed && (
              <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded text-sm">
                已满员
              </span>
            )}
            {isOrganizer && (
              <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-sm">
                我发起的
              </span>
            )}
            {isOrganizer && match.pendingCount > 0 && (
              <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-sm font-medium">
                {match.pendingCount} 人待审核
              </span>
            )}
          </div>

          {/* 时间 */}
          <p className="text-lg font-semibold text-gray-900 mb-1">
            {match.scheduled_at ? formatDateTime(match.scheduled_at) : '时间待定'}
            {match.scheduled_at && (
              <span className="text-sm font-normal text-gray-600 ml-2">
                {formatTimeRange(match.scheduled_at, match.duration_minutes || getDefaultDuration(match.game_type))}
              </span>
            )}
            {match.time_status === 'tentative' && (
              <span className="text-sm font-normal text-gray-500 ml-2">（暂定）</span>
            )}
          </p>

          {/* 地点 */}
          <p className="text-gray-600 mb-2">
            {match.venue || '地点待定'}
            {match.venue_status === 'tentative' && (
              <span className="text-sm text-gray-400 ml-1">（暂定）</span>
            )}
          </p>

          {/* 组织者 */}
          <p className="text-sm text-gray-500 mb-2">
            组织者：{match.organizer_name || '未知'}
          </p>

          {/* 已确认参与者名单 */}
          {confirmedParticipants.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">已确认：</p>
              <div className="flex flex-wrap gap-1">
                {confirmedParticipants.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 bg-green-50 text-green-700 px-2 py-0.5 rounded text-xs"
                  >
                    {p.profile?.display_name || '未知'}
                    {p.profile?.gender && p.profile.gender !== 'unspecified' && (
                      <span className="text-green-500">
                        {p.profile.gender === 'female' ? '♀' : '♂'}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 待确认参与者名单 */}
          {pendingParticipants.length > 0 && (
            <div className="mt-2">
              <p className="text-xs text-gray-500 mb-1">待确认：</p>
              <div className="flex flex-wrap gap-1">
                {pendingParticipants.map(p => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-0.5 rounded text-xs"
                  >
                    {p.profile?.display_name || '未知'}
                    {p.profile?.gender && p.profile.gender !== 'unspecified' && (
                      <span className="text-yellow-500">
                        {p.profile.gender === 'female' ? '♀' : '♂'}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 人数 */}
        <div className="text-right ml-4">
          <p className="text-2xl font-bold text-gray-900">
            {match.confirmed_count}/{match.required_count}
          </p>
          <p className="text-sm text-gray-500">人</p>
          {match.pendingCount > 0 && (
            <p className="text-xs text-yellow-600 mt-1">+{match.pendingCount} 待确认</p>
          )}
        </div>
      </div>
    </Link>
  )
}
