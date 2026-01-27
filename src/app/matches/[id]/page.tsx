/**
 * 球局详情页面
 *
 * [MVP 模式标注]
 * 当前为「无 Group 模式」的 MVP 实现：
 * - 任何登录用户可通过链接访问球局详情
 * - 报名/退出不受 Group 边界限制
 * - 组织者手动管理参与者
 *
 * 未来 Group 模式下：
 * - 访问权限检查：用户必须是 Match 所属 Group 的成员
 * - 报名权限：基于 Group 成员身份
 * - Match 不改变 Group 结构
 */
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime, getGameTypeLabel, getParticipantStatusLabel, formatRelativeTime, formatExactTime, getStateChangeAction, formatTimeRange } from '@/lib/utils'
import { SignUpButton, ManageParticipantButton, CancelMatchButton, CopyLinkButton, AddGuestButton, RemoveGuestButton } from './actions'
import type { MatchDetails, ParticipantWithProfile, ParticipantHistory, GameType } from '@/types'

// 扩展类型
interface ParticipantWithHistory extends ParticipantWithProfile {
  history?: ParticipantHistory[]
}

// Guest participant type (from match_participants + match_guests)
// Note: Supabase returns joined relations as arrays
interface GuestParticipant {
  id: string
  match_id: string
  guest_id: string
  invited_by: string
  created_at: string
  guest:
    | {
        id: string
        email: string
        display_name: string | null
      }
    | {
        id: string
        email: string
        display_name: string | null
      }[]
    | null
}


// 获取默认时长（分钟）
function getDefaultDuration(gameType: GameType): number {
  return gameType === 'singles' ? 60 : 90
}

export default async function MatchDetailPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = await createClient()

  // 检查登录状态
  const { data: { user } } = await supabase.auth.getUser()
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

  // 获取参与者列表 (legacy table)
  const { data: participants } = await supabase
    .from('participants')
    .select(`
      *,
      profile:profiles(*)
    `)
    .eq('match_id', params.id)
    .order('created_at', { ascending: true })

  // 获取 Guest 参与者 (Slice 2.6: match_participants + match_guests)
 const { data: guestParticipants, error: guestErr } = await supabase
  .from('match_participants')
  .select(`
    id,
    match_id,
    guest_id,
    invited_by,
    created_at,
    guest:match_guests(id, email, display_name)
  `)
  .eq('match_id', params.id)
  .not('guest_id', 'is', null)
  .order('created_at', { ascending: true })

console.log('guestErr =', guestErr)
console.log('guestParticipants =', JSON.stringify(guestParticipants, null, 2))


  // 检查当前用户的参与状态（排除已退出/移除的记录）
  const myParticipation = participants?.find(p => p.user_id === user.id && p.state !== 'removed')
  const isOrganizer = match.organizer_id === user.id
  // 检查用户是否为已确认的参与者（用于 AddGuestButton 可见性）
  const isConfirmedParticipant = myParticipation?.state === 'confirmed'
  // 检查用户是否曾经参与过（用于判断是否可以重新报名）
  const hasWithdrawn = participants?.some(p => p.user_id === user.id && p.state === 'removed')

  // 检查用户是否被移除（非组织者）
  const wasRemoved = !isOrganizer && participants?.some(p => p.user_id === user.id && p.state === 'removed')

  // 如果球局已成局且用户被移除，显示受限页面
  if (match.is_formed && wasRemoved) {
    return (
      <main className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-100">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
            <Link href="/matches" className="text-gray-600 hover:text-gray-900 mr-4">
              ← 返回
            </Link>
            <h1 className="font-semibold text-lg">球局详情</h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-8">
          <div className="bg-white rounded-xl p-6 text-center">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m0 0v2m0-2h2m-2 0H9m3-10V4m0 0V2m0 2h2m-2 0H9m12 8a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-700 mb-2">无法查看此球局</h2>
            <p className="text-gray-500">你已被移出此球局，无法查看详情。</p>
            <Link
              href="/matches"
              className="inline-block mt-6 px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              返回球局列表
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // 分类参与者
  const confirmedParticipants = participants?.filter(p => p.state === 'confirmed') || []
  const pendingParticipants = participants?.filter(p => p.state === 'pending') || []
  const waitlistedParticipants = participants?.filter(p => p.state === 'waitlisted') || []

  // 获取所有参与者的状态变更历史
  const participantIds = participants?.map(p => p.id) || []
  let participantHistory: ParticipantHistory[] = []
  if (participantIds.length > 0) {
    const { data: history } = await supabase
      .from('participant_history')
      .select('*')
      .in('participant_id', participantIds)
      .order('changed_at', { ascending: false })
    participantHistory = history || []
  }

  // 将历史记录合并到参与者数据中
  const participantsWithHistory: ParticipantWithHistory[] = (participants || []).map(p => ({
    ...p,
    history: participantHistory.filter(h => h.participant_id === p.id)
  }))

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
            {match.is_formed && (
              <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm">
                已成局
              </span>
            )}
            {match.is_full && !match.is_formed && (
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
            {match.scheduled_at && (
              <p className="text-base text-gray-700 mt-1">
                {formatTimeRange(match.scheduled_at, match.duration_minutes || getDefaultDuration(match.game_type))}
              </p>
            )}
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
                <SignUpButton
                  matchId={match.id}
                  action="withdraw"
                />
              </div>
            ) : (
              <div>
                {hasWithdrawn && (
                  <p className="text-sm text-gray-500 mb-2">你之前已退出此球局，可以重新报名</p>
                )}
                <SignUpButton
                  matchId={match.id}
                  action="signup"
                  disabled={match.is_full}
                />
              </div>
            )}
          </div>
        )}

        {/* 参与者列表 */}
        <div className="bg-white rounded-xl p-6">
          <h2 className="font-semibold mb-4">
            参与者 ({confirmedParticipants.length + (guestParticipants?.length || 0)}/{match.required_count})
            {pendingParticipants.length > 0 && (
              <span className="text-sm font-normal text-yellow-600 ml-2">
                +{pendingParticipants.length} 待审核
              </span>
            )}
            {(guestParticipants?.length || 0) > 0 && (
              <span className="text-sm font-normal text-purple-600 ml-2">
                含 {guestParticipants?.length} 位 Guest
              </span>
            )}
          </h2>

          {confirmedParticipants.length > 0 || (guestParticipants?.length || 0) > 0 ? (
            <ul className="divide-y divide-gray-100">
              {/* Registered participants */}
              {confirmedParticipants.map((p: ParticipantWithProfile) => {
                const pWithHistory = participantsWithHistory.find(ph => ph.id === p.id)
                return (
                  <ParticipantItem
                    key={p.id}
                    participant={p}
                    isOrganizer={isOrganizer}
                    matchId={match.id}
                    showActions={isOrganizer && p.user_id !== match.organizer_id}
                    history={pWithHistory?.history}
                  />
                )
              })}
              {/* Guest participants (Slice 2.6) */}
              {guestParticipants?.map((gp: GuestParticipant) => (
                <GuestParticipantItem
                  key={gp.id}
                  guestParticipant={gp}
                  isOrganizer={isOrganizer}
                  matchId={match.id}
                />
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">暂无确认参与者</p>
          )}

          {/* Add Guest button for confirmed participants */}
          {match.status === 'active' && (isOrganizer || isConfirmedParticipant) && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <AddGuestButton matchId={match.id} />
            </div>
          )}
        </div>

        {/* 待审核列表 - 组织者可操作，其他人只读 */}
        {pendingParticipants.length > 0 && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2">
              待审核
              <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-sm">
                {pendingParticipants.length}
              </span>
            </h2>
            <ul className="divide-y divide-gray-100">
              {pendingParticipants.map((p: ParticipantWithProfile) => {
                const pWithHistory = participantsWithHistory.find(ph => ph.id === p.id)
                return (
                  <ParticipantItem
                    key={p.id}
                    participant={p}
                    isOrganizer={isOrganizer}
                    matchId={match.id}
                    showActions={isOrganizer}
                    history={pWithHistory?.history}
                  />
                )
              })}
            </ul>
          </div>
        )}

        {/* 候补列表 */}
        {waitlistedParticipants.length > 0 && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4">
              候补 ({waitlistedParticipants.length})
            </h2>
            <ul className="divide-y divide-gray-100">
              {waitlistedParticipants.map((p: ParticipantWithProfile, index: number) => {
                const pWithHistory = participantsWithHistory.find(ph => ph.id === p.id)
                return (
                  <ParticipantItem
                    key={p.id}
                    participant={p}
                    isOrganizer={isOrganizer}
                    matchId={match.id}
                    showActions={isOrganizer}
                    waitlistPosition={index + 1}
                    history={pWithHistory?.history}
                  />
                )
              })}
            </ul>
          </div>
        )}

        {/* 组织者操作 */}
        {isOrganizer && match.status === 'active' && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4">组织者操作</h2>
            {match.is_formed && (
              <p className="text-green-600 text-sm mb-4">
                球局已成局！人数已满足要求，时间和地点已确定。
              </p>
            )}
            {!match.is_formed && match.is_full && (
              <p className="text-orange-600 text-sm mb-4">
                人数已满，请确定{match.time_status === 'tentative' && '时间'}{match.time_status === 'tentative' && match.venue_status === 'tentative' && '和'}{match.venue_status === 'tentative' && '地点'}后成局
              </p>
            )}
            {!match.is_formed && !match.is_full && (
              <p className="text-gray-500 text-sm mb-4">
                还需 {match.required_count - match.confirmed_count} 人确认，且确定时间地点后成局
              </p>
            )}
            <div className="flex flex-wrap gap-4">
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

        {/* 活动日志 */}
        {participantHistory.length > 0 && (
          <div className="bg-white rounded-xl p-6">
            <h2 className="font-semibold mb-4">活动日志</h2>
            <ul className="space-y-3">
              {participantHistory.slice(0, 20).map((h) => {
                const participant = participantsWithHistory.find(p => p.id === h.participant_id)
                return (
                  <li key={h.id} className="flex items-start gap-3 text-sm">
                    <span className="text-gray-400 whitespace-nowrap">
                      {formatRelativeTime(h.changed_at)}
                    </span>
                    <span className="flex-1">
                      <span className="font-medium">
                        {participant?.profile?.display_name || '未知用户'}
                      </span>
                      <span className="text-gray-600 ml-1">
                        {getStateChangeAction(h.old_state, h.new_state)}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            {participantHistory.length > 20 && (
              <p className="text-sm text-gray-400 mt-3">
                仅显示最近 20 条记录
              </p>
            )}
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
  history = [],
}: {
  participant: ParticipantWithProfile
  isOrganizer: boolean
  matchId: string
  showActions?: boolean
  waitlistPosition?: number
  history?: ParticipantHistory[]
}) {
  // 从历史记录中提取关键时间点
  const signupTime = history.find(h => h.old_state === null && h.new_state === 'pending')?.changed_at
  const confirmedTime = history.find(h => h.new_state === 'confirmed')?.changed_at
  const removedTime = history.filter(h => h.new_state === 'removed').pop()?.changed_at

  return (
    <li className="py-3 px-3 rounded-lg hover:bg-gray-50">
      <div className="flex items-center justify-between">
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
            {participant.state === 'confirmed' && (
              <ManageParticipantButton
                matchId={matchId}
                participantId={participant.id}
                action="remove"
              />
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
      </div>

      {/* 时间记录 */}
      {history.length > 0 && (
        <div className="mt-2 ml-11 text-xs text-gray-400 space-x-3">
          {signupTime && (
            <span>报名: {formatExactTime(signupTime)}</span>
          )}
          {confirmedTime && (
            <span>确认: {formatExactTime(confirmedTime)}</span>
          )}
          {removedTime && participant.state === 'removed' && (
            <span>移除: {formatExactTime(removedTime)}</span>
          )}
        </div>
      )}
    </li>
  )
}

// Guest participant item component (Slice 2.6)
function GuestParticipantItem({
  guestParticipant,
  isOrganizer,
  matchId,
}: {
  guestParticipant: GuestParticipant
  isOrganizer: boolean
  matchId: string
}) {
  // Extract guest info (Supabase returns as array)
  const guest =
  Array.isArray(guestParticipant.guest)
    ? guestParticipant.guest?.[0]
    : guestParticipant.guest

  const displayName = guest?.display_name || guest?.email || '未知 Guest'
  const initial = displayName[0]?.toUpperCase() || '?'

  return (
    <li className="py-3 px-3 rounded-lg hover:bg-gray-50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-sm font-medium text-purple-700">
            {initial}
          </div>
          <div>
            <span>{displayName}</span>
            <span className="ml-2 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              Guest
            </span>
          </div>
        </div>

        {/* Organizer can remove guests */}
        {isOrganizer && (
          <RemoveGuestButton
            participantId={guestParticipant.id}
            guestName={displayName}
          />
        )}
      </div>
      {/* Show email if different from display name */}
      {guest?.display_name && guest?.email && (
        <div className="mt-1 ml-11 text-xs text-gray-400">
          {guest.email}
        </div>
      )}
    </li>
  )
}
