'use server'

import { createClient } from '@/lib/supabase/server'
import { sendMatchFormationEmails } from '@/lib/email'
import { formatDateTime, formatTimeRange, getGameTypeLabel } from '@/lib/utils'
import type { GameType } from '@/types'

// 获取默认时长（分钟）
function getDefaultDuration(gameType: GameType): number {
  return gameType === 'singles' ? 60 : 90
}

// 检查球局是否成局，如果是则发送邮件通知
export async function checkAndSendFormationEmails(matchId: string): Promise<{
  isFormed: boolean
  emailsSent?: number
  error?: string
}> {
  const supabase = await createClient()

  // 获取球局详情
  const { data: match, error: matchError } = await supabase
    .from('match_details')
    .select('*')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return { isFormed: false, error: '球局不存在' }
  }

  // 检查是否成局
  if (!match.is_formed) {
    return { isFormed: false }
  }

  // 获取所有已确认的参与者
  const { data: participants, error: participantsError } = await supabase
    .from('participants')
    .select(`
      user_id,
      profile:profiles(display_name)
    `)
    .eq('match_id', matchId)
    .eq('state', 'confirmed')

  if (participantsError || !participants) {
    console.error('[Email] Failed to fetch participants:', participantsError)
    return { isFormed: true, error: '获取参与者失败' }
  }

  console.log('[Email] Found participants:', participants.length)

  // 获取参与者的邮箱（从 user_settings 表）
  const userIds = participants.map(p => p.user_id)
  const { data: userSettings, error: settingsError } = await supabase
    .from('user_settings')
    .select('user_id, email')
    .in('user_id', userIds)

  if (settingsError) {
    console.error('[Email] Failed to fetch user_settings:', settingsError)
  }

  console.log('[Email] Found user_settings:', userSettings?.length || 0, userSettings)

  // 建立 user_id -> email 的映射
  const emailMap = new Map<string, string>()
  if (userSettings) {
    for (const s of userSettings) {
      if (s.email) {
        emailMap.set(s.user_id, s.email)
      }
    }
  }

  // 准备邮件数据
  const participantEmails: Array<{ email: string; name: string }> = []
  const participantNames: string[] = []

  for (const p of participants) {
    const name = (p.profile as { display_name?: string })?.display_name || '球友'
    const email = emailMap.get(p.user_id)

    participantNames.push(name)

    if (email) {
      participantEmails.push({ email, name })
      console.log('[Email] Will send to:', email, name)
    } else {
      console.log('[Email] No email for user:', p.user_id, name)
    }
  }

  if (participantEmails.length === 0) {
    console.log('[Email] No participant emails found')
    return { isFormed: true, emailsSent: 0 }
  }

  // 构建球局信息
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://playerhoods.com'
  const matchUrl = `${baseUrl}/matches/${matchId}`

  const durationMinutes = match.duration_minutes || getDefaultDuration(match.game_type as GameType)

  const matchInfo = {
    matchDate: match.scheduled_at ? formatDateTime(match.scheduled_at) : '待定',
    matchTimeRange: match.scheduled_at ? formatTimeRange(match.scheduled_at, durationMinutes) : '',
    venue: match.venue || '待定',
    gameType: getGameTypeLabel(match.game_type, match.doubles_mode),
    organizerName: match.organizer_name || '组织者',
    matchUrl,
    participantNames,
  }

  // 发送邮件
  const result = await sendMatchFormationEmails(participantEmails, matchInfo)

  return {
    isFormed: true,
    emailsSent: result.successful,
  }
}
