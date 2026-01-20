'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { GameType, DoublesMode, FinalizedStatus } from '@/types'

export default function CreateMatchPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 表单状态
  const [gameType, setGameType] = useState<GameType>('doubles')
  const [doublesMode, setDoublesMode] = useState<DoublesMode>('mixed')
  const [courtCount, setCourtCount] = useState(1)
  const [requiredCount, setRequiredCount] = useState(4)
  const [timeStatus, setTimeStatus] = useState<FinalizedStatus>('tentative')
  const [venueStatus, setVenueStatus] = useState<FinalizedStatus>('tentative')
  const [scheduledAt, setScheduledAt] = useState('')
  const [venue, setVenue] = useState('')

  // 根据游戏类型计算默认人数
  const getDefaultRequiredCount = (type: GameType, courts: number) => {
    switch (type) {
      case 'singles':
        return courts * 2
      case 'doubles':
        return courts * 4
      case 'practice':
        return 4 // 练球默认4人
      default:
        return 4
    }
  }

  // 游戏类型变更时更新默认人数
  const handleGameTypeChange = (type: GameType) => {
    setGameType(type)
    setRequiredCount(getDefaultRequiredCount(type, courtCount))
  }

  // 场地数量变更时更新默认人数
  const handleCourtCountChange = (count: number) => {
    setCourtCount(count)
    setRequiredCount(getDefaultRequiredCount(gameType, count))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    
    // 获取当前用户
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('请先登录')
      setLoading(false)
      return
    }

    // 创建球局
    const { data, error: insertError } = await supabase
      .from('matches')
      .insert({
        organizer_id: user.id,
        game_type: gameType,
        doubles_mode: gameType === 'doubles' ? doublesMode : null,
        court_count: courtCount,
        required_count: requiredCount,
        time_status: timeStatus,
        venue_status: venueStatus,
        scheduled_at: scheduledAt || null,
        venue: venue || null,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
    } else {
      router.push(`/matches/${data.id}`)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center">
          <Link href="/matches" className="text-gray-600 hover:text-gray-900 mr-4">
            ← 返回
          </Link>
          <h1 className="font-semibold text-lg">发起球局</h1>
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
                  onClick={() => handleGameTypeChange(type)}
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
                  onClick={() => handleCourtCountChange(count)}
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
            <p className="text-sm text-gray-500 mt-1">
              建议：{getDefaultRequiredCount(gameType, courtCount)} 人
            </p>
          </div>

          {/* 时间 */}
          <div>
            <label htmlFor="scheduledAt" className="block text-sm font-medium text-gray-700 mb-2">
              时间
            </label>
            <div className="flex items-center gap-4">
              <input
                id="scheduledAt"
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="flex-1"
              />
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
            disabled={loading}
            className="w-full bg-primary-500 text-white py-3 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '创建中...' : '创建球局'}
          </button>
        </form>
      </div>
    </main>
  )
}
