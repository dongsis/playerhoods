'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useToast } from '@/components/Toast'
import { checkAndSendFormationEmails } from '../email-actions'
import type { GameType, DoublesMode, FinalizedStatus } from '@/types'

// 生成15分钟间隔的时间选项，从8:30开始
function generateTimeOptions() {
  const options: string[] = []
  for (let hour = 8; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      // 跳过8:00和8:15，从8:30开始
      if (hour === 8 && minute < 30) continue
      const h = hour.toString().padStart(2, '0')
      const m = minute.toString().padStart(2, '0')
      options.push(`${h}:${m}`)
    }
  }
  return options
}

const TIME_OPTIONS = generateTimeOptions()

// 时长选项（分钟）
const DURATION_OPTIONS = [
  { value: 60, label: '1 小时' },
  { value: 90, label: '1.5 小时' },
  { value: 120, label: '2 小时' },
  { value: 150, label: '2.5 小时' },
  { value: 180, label: '3 小时' },
]

export default function EditMatchPage() {
  const router = useRouter()
  const params = useParams()
  const { showToast } = useToast()
  const matchId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 表单状态
  const [gameType, setGameType] = useState<GameType>('doubles')
  const [doublesMode, setDoublesMode] = useState<DoublesMode>('mixed')
  const [courtCount, setCourtCount] = useState(1)
  const [requiredCount, setRequiredCount] = useState(4)
  const [timeStatus, setTimeStatus] = useState<FinalizedStatus>('tentative')
  const [venueStatus, setVenueStatus] = useState<FinalizedStatus>('tentative')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('08:30')
  const [durationMinutes, setDurationMinutes] = useState(90)
  const [venue, setVenue] = useState('')

  // 组合日期和时间为 ISO 字符串
  const scheduledAt = useMemo(() => {
    if (!scheduledDate) return ''
    return `${scheduledDate}T${scheduledTime}`
  }, [scheduledDate, scheduledTime])

  // 加载球局数据
  useEffect(() => {
    const loadMatch = async () => {
      const supabase = createClient()
      const { data: match, error } = await supabase
        .from('matches')
        .select('*')
        .eq('id', matchId)
        .single()

      if (error || !match) {
        setError('球局不存在')
        setLoading(false)
        return
      }

      // 填充表单
      setGameType(match.game_type)
      setDoublesMode(match.doubles_mode || 'mixed')
      setCourtCount(match.court_count)
      setRequiredCount(match.required_count)
      setTimeStatus(match.time_status)
      setVenueStatus(match.venue_status)
      setVenue(match.venue || '')
      setDurationMinutes(match.duration_minutes || (match.game_type === 'singles' ? 60 : 90))

      // 解析日期和时间
      if (match.scheduled_at) {
        const dateTime = new Date(match.scheduled_at)
        const date = dateTime.toISOString().split('T')[0]
        const hours = dateTime.getHours().toString().padStart(2, '0')
        const minutes = dateTime.getMinutes().toString().padStart(2, '0')
        setScheduledDate(date)
        setScheduledTime(`${hours}:${minutes}`)
      }

      setLoading(false)
    }

    loadMatch()
  }, [matchId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSaving(true)

    const supabase = createClient()

    const { error: updateError } = await supabase
      .from('matches')
      .update({
        game_type: gameType,
        doubles_mode: gameType === 'doubles' ? doublesMode : null,
        court_count: courtCount,
        required_count: requiredCount,
        time_status: timeStatus,
        venue_status: venueStatus,
        scheduled_at: scheduledAt || null,
        venue: venue || null,
        duration_minutes: durationMinutes,
      })
      .eq('id', matchId)

    if (updateError) {
      console.error('保存失败:', updateError)
      setError(updateError.message)
      showToast(`保存失败: ${updateError.message}`, 'error')
      setSaving(false)
    } else {
      showToast('保存成功')

      // 检查成局状态并发送邮件
      checkAndSendFormationEmails(matchId).then(result => {
        if (result.isFormed && result.emailsSent && result.emailsSent > 0) {
          showToast(`球局已成局，已通知 ${result.emailsSent} 位参与者`, 'success')
        }
      }).catch(err => {
        console.error('[Email] Failed to send formation emails:', err)
      })

      router.push(`/matches/${matchId}`)
      router.refresh()
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">加载中...</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
          <Link href={`/matches/${matchId}`} className="text-gray-600 hover:text-gray-900 mr-4">
            ← 返回
          </Link>
          <h1 className="font-semibold text-lg">编辑球局</h1>
        </div>
      </header>

      {/* Form */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 space-y-6">
          {/* 球局类型 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              球局类型
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['singles', 'doubles', 'practice'] as GameType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setGameType(type)}
                  className={`py-3 px-4 rounded-lg border-2 font-medium transition-colors ${
                    gameType === type
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {type === 'singles' && '单打'}
                  {type === 'doubles' && '双打'}
                  {type === 'practice' && '练球'}
                </button>
              ))}
            </div>
          </div>

          {/* 双打模式 */}
          {gameType === 'doubles' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                双打类型
              </label>
              <div className="grid grid-cols-4 gap-3">
                {([
                  { value: 'mens', label: '男双' },
                  { value: 'womens', label: '女双' },
                  { value: 'mixed', label: '混双' },
                  { value: 'open', label: '开放' },
                ] as { value: DoublesMode; label: string }[]).map((mode) => (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setDoublesMode(mode.value)}
                    className={`py-2 px-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      doublesMode === mode.value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 场地数量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              场地数量
            </label>
            <div className="flex gap-3">
              {[1, 2, 3, 4, 5].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => setCourtCount(count)}
                  className={`w-12 h-12 rounded-lg border-2 font-medium transition-colors ${
                    courtCount === count
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* 需要人数 */}
          <div>
            <label htmlFor="requiredCount" className="block text-sm font-medium text-gray-700 mb-2">
              需要人数
            </label>
            <input
              id="requiredCount"
              type="number"
              min={2}
              max={20}
              value={requiredCount}
              onChange={(e) => setRequiredCount(parseInt(e.target.value) || 2)}
              className="w-32"
            />
          </div>

          {/* 时间 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              时间
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="flex-1 min-w-[140px]"
              />
              <select
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                {TIME_OPTIONS.map((time) => (
                  <option key={time} value={time}>
                    {time}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={timeStatus === 'finalized'}
                  onChange={(e) => setTimeStatus(e.target.checked ? 'finalized' : 'tentative')}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">已确定</span>
              </label>
            </div>
          </div>

          {/* 时长 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              时长
            </label>
            <div className="flex gap-2 flex-wrap">
              {DURATION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setDurationMinutes(option.value)}
                  className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                    durationMinutes === option.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* 地点 */}
          <div>
            <label htmlFor="venue" className="block text-sm font-medium text-gray-700 mb-2">
              地点
            </label>
            <div className="flex items-center gap-4">
              <input
                id="venue"
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder="球场名称或地址"
                className="flex-1"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={venueStatus === 'finalized'}
                  onChange={(e) => setVenueStatus(e.target.checked ? 'finalized' : 'tentative')}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-600">已确定</span>
              </label>
            </div>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* 提交按钮 */}
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-primary-500 text-white py-3 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '保存中...' : '保存修改'}
          </button>
        </form>
      </div>
    </main>
  )
}
