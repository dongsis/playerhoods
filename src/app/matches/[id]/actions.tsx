'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getCurrentUserClient } from '@/lib/supabase/client-with-dev'
import { useToast } from '@/components/Toast'

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
    const { user } = await getCurrentUserClient()

    if (!user) {
      router.push('/login')
      return
    }

    if (action === 'signup') {
      // 报名
      const { error } = await supabase
        .from('participants')
        .insert({
          match_id: matchId,
          user_id: user.id,
          state: 'pending',
        })

      if (error) {
        showToast('报名失败，请重试', 'error')
      } else {
        showToast('报名成功，等待组织者确认')
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
