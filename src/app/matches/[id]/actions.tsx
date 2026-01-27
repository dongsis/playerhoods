/**
 * 球局操作组件
 *
 * [MVP 模式标注]
 * 当前为「无 Group 模式」的 MVP 实现：
 * - 报名/退出：任何登录用户可操作
 * - 参与者管理：由 Match 组织者（创建者）手动管理
 * - 确认/移除：基于 Match 级别权限，不涉及 Group
 *
 * 未来 Group 模式下：
 * - 报名权限：检查是否为 Match 所属 Group 的成员
 * - 参与者管理：Organized Group 由 boundary keeper 管理
 * - Direct Group：对等处理，无特殊管理权限
 */
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import { checkAndSendFormationEmails } from './email-actions'

// 辅助函数：检查成局状态
// 成局条件：人数达标 AND 时间确定 AND 地点确定
async function checkMatchFormationStatus(
  supabase: ReturnType<typeof createClient>,
  matchId: string
): Promise<{ isFormed: boolean; isFull: boolean; message?: string }> {
  // 获取球局信息
  const { data: match } = await supabase
    .from('matches')
    .select('required_count, time_status, venue_status')
    .eq('id', matchId)
    .single()

  if (!match) {
    return { isFormed: false, isFull: false }
  }

  // 获取已确认参与者数量
  const { count } = await supabase
    .from('participants')
    .select('*', { count: 'exact', head: true })
    .eq('match_id', matchId)
    .eq('state', 'confirmed')

  const confirmedCount = count || 0
  const isFull = confirmedCount >= match.required_count
  const isTimeFinalized = match.time_status === 'finalized'
  const isVenueFinalized = match.venue_status === 'finalized'
  const isFormed = isFull && isTimeFinalized && isVenueFinalized

  // 返回状态信息
  if (isFormed) {
    return { isFormed: true, isFull: true, message: '球局已成局！' }
  }

  if (isFull && (!isTimeFinalized || !isVenueFinalized)) {
    const missing = []
    if (!isTimeFinalized) missing.push('时间')
    if (!isVenueFinalized) missing.push('地点')
    return {
      isFormed: false,
      isFull: true,
      message: `人数已满，待确定${missing.join('和')}后成局`
    }
  }

  return { isFormed: false, isFull: false }
}

// 报名/退出按钮
export function SignUpButton({
  matchId,
  action,
  disabled = false,
}: {
  matchId: string
  action: 'signup' | 'withdraw'
  disabled?: boolean
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push('/login')
      return
    }

    if (action === 'signup') {
      // 检查是否已有参与记录（可能是之前退出的）
      // 使用 maybeSingle() 而不是 single()，因为可能没有记录
      const { data: existingParticipants } = await supabase
        .from('participants')
        .select('id, state')
        .eq('match_id', matchId)
        .eq('user_id', user.id)

      const existingParticipant = existingParticipants?.[0]

      let error
      if (existingParticipant) {
        // 已有记录，更新状态为 pending（重新报名）
        const result = await supabase
          .from('participants')
          .update({ state: 'pending' })
          .eq('id', existingParticipant.id)
        error = result.error
      } else {
        // 新报名
        const result = await supabase
          .from('participants')
          .insert({
            match_id: matchId,
            user_id: user.id,
            state: 'pending',
          })
        error = result.error
      }

      if (error) {
        console.error('报名失败:', error)
        showToast(`报名失败: ${error.message}`, 'error')
      } else {
        showToast(existingParticipant ? '重新报名成功，等待组织者确认' : '报名成功，等待组织者确认')
      }
    } else {
      // 退出 - 更新状态为 removed
      const { error } = await supabase
        .from('participants')
        .update({ state: 'removed' })
        .eq('match_id', matchId)
        .eq('user_id', user.id)

      if (error) {
        showToast('操作失败，请重试', 'error')
      } else {
        showToast('已退出球局')
      }
    }

    router.refresh()
    setLoading(false)
  }

  if (action === 'signup') {
    return (
      <button
        onClick={handleClick}
        disabled={loading || disabled}
        className="w-full bg-primary-500 text-white py-3 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? '处理中...' : disabled ? '球局已满' : '我要报名'}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-red-500 hover:text-red-600 text-sm"
    >
      {loading ? '处理中...' : '退出球局'}
    </button>
  )
}

// 组织者管理参与者按钮
export function ManageParticipantButton({
  matchId,
  participantId,
  action,
}: {
  matchId: string
  participantId: string
  action: 'confirm' | 'remove'
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    setLoading(true)
    const supabase = createClient()

    const newState = action === 'confirm' ? 'confirmed' : 'removed'

    const { error } = await supabase
      .from('participants')
      .update({ state: newState })
      .eq('id', participantId)

    if (error) {
      showToast('操作失败，请重试', 'error')
    } else {
      showToast(action === 'confirm' ? '已确认参与者' : '已移除参与者')

      // 检查成局状态并提示
      const { isFormed, message } = await checkMatchFormationStatus(supabase, matchId)
      if (message) {
        showToast(message, message.includes('已成局') ? 'success' : 'info')
      }

      // 如果成局，发送邮件通知
      if (isFormed) {
        checkAndSendFormationEmails(matchId).then(result => {
          if (result.emailsSent && result.emailsSent > 0) {
            console.log(`[Email] Formation emails sent: ${result.emailsSent}`)
          }
        }).catch(err => {
          console.error('[Email] Failed to send formation emails:', err)
        })
      }
    }

    router.refresh()
    setLoading(false)
  }

  if (action === 'confirm') {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
      >
        {loading ? '...' : '确认'}
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
    >
      {loading ? '...' : '移除'}
    </button>
  )
}

// 复制链接按钮
export function CopyLinkButton({ matchId }: { matchId: string }) {
  const [copied, setCopied] = useState(false)

  const handleClick = async () => {
    const url = `${window.location.origin}/matches/${matchId}`
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
    >
      {copied ? (
        <>
          <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-600">已复制</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>复制链接</span>
        </>
      )}
    </button>
  )
}

// 取消球局按钮
export function CancelMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!confirm('确定要取消这个球局吗？此操作不可撤销。')) {
      return
    }

    setLoading(true)
    const supabase = createClient()

    await supabase
      .from('matches')
      .update({ status: 'cancelled' })
      .eq('id', matchId)

    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-4 py-2 text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
    >
      {loading ? '取消中...' : '取消球局'}
    </button>
  )
}

// 添加 Guest 按钮和表单
export function AddGuestButton({ matchId }: { matchId: string }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !email.includes('@')) {
      showToast('请输入有效的邮箱地址', 'error')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      showToast('请先登录', 'error')
      setLoading(false)
      return
    }

    // Use atomic RPC (Slice 2.6)
    // Authorization: caller must be match creator OR confirmed participant
    // Handles: find-or-create guest + add to match + duplicate check (match-scoped)
    const { data, error: rpcError } = await supabase.rpc('add_guest_to_match', {
      p_match_id: matchId,
      p_email: email,
      p_display_name: displayName.trim() || null,
    })

    if (rpcError) {
      console.error('添加 Guest 失败:', rpcError)
      showToast(`添加失败: ${rpcError.message}`, 'error')
      setLoading(false)
      return
    }

    // Handle both object and array RPC return shapes
    // Supabase may return single object or array depending on function signature
    const result = Array.isArray(data) ? data[0] : data

    // Guard null/undefined payload
    if (!result || typeof result.status !== 'string') {
      console.error('RPC 返回格式异常:', data)
      showToast('添加失败：服务器响应异常', 'error')
      setLoading(false)
      return
    }

    // Handle RPC result status
    if (result.status === 'already_in_match') {
      showToast('该邮箱已在此球局中', 'error')
      setLoading(false)
      return
    }

    if (result.status === 'unauthorized') {
      showToast('您没有权限添加 Guest', 'error')
      setLoading(false)
      return
    }

    if (result.status === 'match_not_found') {
      showToast('球局不存在', 'error')
      setLoading(false)
      return
    }

    if (result.status !== 'success') {
      showToast(`添加失败: ${result.status}`, 'error')
      setLoading(false)
      return
    }

    showToast(`已添加 Guest: ${displayName || email}`)
    setEmail('')
    setDisplayName('')
    setShowForm(false)
    router.refresh()
    setLoading(false)
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
      >
        添加 Guest
      </button>
    )
  }

  return (
    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
      <h3 className="font-medium mb-3">添加 Guest（非注册用户）</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label htmlFor="guest-email" className="block text-sm text-gray-600 mb-1">
            邮箱 <span className="text-red-500">*</span>
          </label>
          <input
            id="guest-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="guest@example.com"
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div>
          <label htmlFor="guest-name" className="block text-sm text-gray-600 mb-1">
            姓名（可选）
          </label>
          <input
            id="guest-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="显示名称"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors disabled:opacity-50"
          >
            {loading ? '添加中...' : '确认添加'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm(false)
              setEmail('')
              setDisplayName('')
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  )
}

// 移除 Guest 按钮 (Slice 2.6)
export function RemoveGuestButton({
  participantId,
  guestName,
}: {
  participantId: string
  guestName: string
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleRemove = async () => {
    if (!confirm(`确定要移除 ${guestName} 吗？`)) {
      return
    }

    setLoading(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('match_participants')
      .delete()
      .eq('id', participantId)

    if (error) {
      console.error('移除 Guest 失败:', error)
      showToast(`移除失败: ${error.message}`, 'error')
    } else {
      showToast(`已移除 ${guestName}`)
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <button
      onClick={handleRemove}
      disabled={loading}
      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
    >
      {loading ? '移除中...' : '移除'}
    </button>
  )
}

// 确认球局按钮
export function ConfirmMatchButton({
  matchId,
  disabled = false,
}: {
  matchId: string
  disabled?: boolean
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!confirm('确认球局后，时间和地点将锁定。确定要确认吗？')) {
      return
    }

    setLoading(true)
    const supabase = createClient()

    // 先获取当前用户确认权限
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      showToast('请先登录', 'error')
      setLoading(false)
      return
    }

    // 更新 time_status 和 venue_status 为 finalized
    const { error, data } = await supabase
      .from('matches')
      .update({
        time_status: 'finalized',
        venue_status: 'finalized',
      })
      .eq('id', matchId)
      .select()

    console.log('确认球局结果:', { error, data, matchId, userId: user.id })

    if (error) {
      console.error('确认球局失败:', error)
      showToast(`确认失败: ${error.message}`, 'error')
    } else if (!data || data.length === 0) {
      console.error('确认球局失败: 没有更新任何记录，可能是RLS策略阻止')
      showToast('确认失败: 权限不足，只有组织者可以确认球局', 'error')
    } else {
      showToast('球局已确认')

      // 检查成局状态并发送邮件
      checkAndSendFormationEmails(matchId).then(result => {
        if (result.isFormed && result.emailsSent && result.emailsSent > 0) {
          showToast(`已通知 ${result.emailsSent} 位参与者`, 'success')
        }
      }).catch(err => {
        console.error('[Email] Failed to send formation emails:', err)
      })
    }

    router.refresh()
    setLoading(false)
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || disabled}
      className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? '确认中...' : '确认球局'}
    </button>
  )
}
