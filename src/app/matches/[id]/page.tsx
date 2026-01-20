import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/server-with-dev'
import { formatDateTime, getGameTypeLabel, getParticipantStatusLabel } from '@/lib/utils'
import { SignUpButton, ManageParticipantButton, CancelMatchButton, CopyLinkButton } from './actions'
import type { MatchDetails, ParticipantWithProfile } from '@/types'

export default async function MatchDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  // 检查登录状态（支持开发模式用户切换）
  const { user } = await getCurrentUser()
  if (!user) {
    redirect('/login')
  }

  // 获取球局详情
  const { data: match, error } = await supabase
    .from('match_details')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !match) {
    notFound()
  }

  // 获取参与者列表
  const { data: participants } = await supabase
    .from('participants')
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq('match_id', params.id)
    .order('created_at', { ascending: true })

  // 检查当前用户的参与状态
  const myParticipation = participants?.find(p => p.user_id === user.id)
  const isOrganizer = match.organizer_id === user.id

  // 分类参与者
  const confirmedParticipants = participants?.filter(p => p.state === 'confirmed') || []
  const pendingParticipants = participants?.filter(p => p.state === 'pending') || []
  const waitlistedParticipants = participants?.filter(p => p.state === 'waitlisted') || []

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
          <Link href="/matches" className="text-gray-600 hover:text-gray-900 mr-4">
            ← 返回
          </Link>
          <h1 className="font-semibold text-lg">球局详情</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* 球局信息卡片 */}
        <div className="bg-white rounded-xl p-6">
          {/* 状态标签 */}
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-medium">
              {getGameTypeLabel(match.game_type, match.doubles_mode)}
            </span>
            {match.is_full && (
              <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm">
                已满员
              </span>
            )}
            {match.status === 'cancelled' && (
              <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                已取消
              </span>
            )}
          </div>

          {/* 时间 */}
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-1">时间</p>
            <p className="text-xl font-semibold">
              {match.scheduled_at ? formatDateTime(match.scheduled_at) : '待定'}
              {match.time_status === 'tentative' && (
                <span className="text-sm font-normal text-orange-500 ml-2">（暂定）</span>
              )}
            </p>
          </div>

          {/* 地点 */}
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-1">地点</p>
            <p className="text-lg">
              {match.venue || '待定'}
              {match.venue_status === 'tentative' && (
                <span className="text-sm text-orange-500 ml-2">（暂定）</span>
              )}
            </p>
          </div>

          {/* 人数 */}
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-1">人数</p>
            <p className="text-lg">
              <span className="font-semibold">{match.confirmed_count}</span>
              <span className="text-gray-400"> / {match.required_count} 人</span>
              <span className="text-sm text-gray-500 ml-2">（{match.court_count} 片场地）</span>
            </p>
          </div>

          {/* 组织者 */}
          <div className="mb-4">
            <p className="text-sm text-gray-500 mb-1">组织者</p>
            <p className="text-lg">{match.organizer_name || '未知'}</p>
          </div>

          {/* 分享链接 */}
          <div className="pt-4 border-t border-gray-100">
            <CopyLinkButton matchId={match.id} />
          </div>
        </div>

        {/* 我的状态 & 操作 */}
        {match.status === 'active' && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4">我的状态</h2>
            
            {myParticipation ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                    myParticipation.state === 'confirmed' 
                      ? 'bg-green-100 text-green-700'
                      : myParticipation.state === 'pending'
                      ? 'bg-yellow-100 text-yellow-700'
                      : myParticipation.state === 'waitlisted'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}>
                    {getParticipantStatusLabel(myParticipation.state)}
                  </span>
                  {myParticipation.state === 'waitlisted' && (
                    <span className="text-sm text-gray-500 ml-2">
                      #{waitlistedParticipants.findIndex(p => p.user_id === user.id) + 1}
                    </span>
                  )}
                </div>
                {myParticipation.state !== 'removed' && (
                  <SignUpButton 
                    matchId={match.id} 
                    action="withdraw"
                  />
                )}
              </div>
            ) : (
              <SignUpButton 
                matchId={match.id} 
                action="signup"
                disabled={match.is_full}
              />
            )}
          </div>
        )}

        {/* 参与者列表 */}
        <div className="bg-white rounded-xl p-6">
          <h2 className="font-semibold mb-4">
            参与者 ({confirmedParticipants.length}/{match.required_count})
          </h2>
          
          {confirmedParticipants.length > 0 ? (
            <ul className="space-y-2">
              {confirmedParticipants.map((p: ParticipantWithProfile) => (
                <ParticipantItem 
                  key={p.id} 
                  participant={p} 
                  isOrganizer={isOrganizer}
                  matchId={match.id}
                />
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">暂无确认参与者</p>
          )}
        </div>

        {/* 组织者视图：待审核 */}
        {isOrganizer && pendingParticipants.length > 0 && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              待审核
              <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-sm">
                {pendingParticipants.length}
              </span>
            </h2>
            <ul className="space-y-2">
              {pendingParticipants.map((p: ParticipantWithProfile) => (
                <ParticipantItem 
                  key={p.id} 
                  participant={p} 
                  isOrganizer={isOrganizer}
                  matchId={match.id}
                  showActions
                />
              ))}
            </ul>
          </div>
        )}

        {/* 候补列表 */}
        {waitlistedParticipants.length > 0 && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4">
              候补 ({waitlistedParticipants.length})
            </h2>
            <ul className="space-y-2">
              {waitlistedParticipants.map((p: ParticipantWithProfile, index: number) => (
                <ParticipantItem 
                  key={p.id} 
                  participant={p} 
                  isOrganizer={isOrganizer}
                  matchId={match.id}
                  showActions={isOrganizer}
                  waitlistPosition={index + 1}
                />
              ))}
            </ul>
          </div>
        )}

        {/* 组织者操作 */}
        {isOrganizer && match.status === 'active' && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4">组织者操作</h2>
            <div className="flex gap-4">
              <Link
                href={`/matches/${match.id}/edit`}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                编辑球局
              </Link>
              <CancelMatchButton matchId={match.id} />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}

function ParticipantItem({ 
  participant, 
  isOrganizer,
  matchId,
  showActions = false,
  waitlistPosition,
}: { 
  participant: ParticipantWithProfile
  isOrganizer: boolean
  matchId: string
  showActions?: boolean
  waitlistPosition?: number
}) {
  return (
    <li className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50">
      <div className="flex items-center gap-3">
        {waitlistPosition && (
          <span className="text-sm text-gray-400">#{waitlistPosition}</span>
        )}
        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-sm font-medium">
          {participant.profile?.display_name?.[0] || '?'}
        </div>
        <span>{participant.profile?.display_name || '未知用户'}</span>
        {participant.profile?.gender && participant.profile.gender !== 'unspecified' && (
          <span className="text-sm text-gray-400">
            {participant.profile.gender === 'female' ? '♀' : '♂'}
          </span>
        )}
      </div>
      
      {isOrganizer && showActions && (
        <div className="flex gap-2">
          {participant.state === 'pending' && (
            <>
              <ManageParticipantButton 
                matchId={matchId}
                participantId={participant.id}
                action="confirm"
              />
              <ManageParticipantButton 
                matchId={matchId}
                participantId={participant.id}
                action="remove"
              />
            </>
          )}
          {participant.state === 'waitlisted' && (
            <ManageParticipantButton 
              matchId={matchId}
              participantId={participant.id}
              action="confirm"
            />
          )}
        </div>
      )}
    </li>
  )
}
