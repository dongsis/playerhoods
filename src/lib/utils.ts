import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// 格式化日期时间
export function formatDateTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleString('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 格式化日期
export function formatDate(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })
}

// 格式化时间
export function formatTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 游戏类型显示名称
export function getGameTypeLabel(gameType: string, doublesMode?: string | null) {
  switch (gameType) {
    case 'singles':
      return '单打'
    case 'doubles':
      const modeLabels: Record<string, string> = {
        mens: '男双',
        womens: '女双',
        mixed: '混双',
        open: '双打（开放）',
      }
      return doublesMode ? modeLabels[doublesMode] || '双打' : '双打'
    case 'practice':
      return '练球'
    default:
      return gameType
  }
}

// 参与者状态显示（中性文案）
export function getParticipantStatusLabel(state: string) {
  switch (state) {
    case 'pending':
      return '等待确认'
    case 'confirmed':
      return '已确认'
    case 'waitlisted':
      return '候补中'
    case 'removed':
      return '未参与'
    default:
      return state
  }
}

// 格式化相对时间
export function formatRelativeTime(date: string | Date) {
  const d = new Date(date)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) {
    return '刚刚'
  } else if (diffMin < 60) {
    return `${diffMin} 分钟前`
  } else if (diffHour < 24) {
    return `${diffHour} 小时前`
  } else if (diffDay < 7) {
    return `${diffDay} 天前`
  } else {
    return formatDateTime(date)
  }
}

// 格式化精确时间（用于历史记录）
export function formatExactTime(date: string | Date) {
  const d = new Date(date)
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 格式化时间范围（开始时间 - 结束时间）
export function formatTimeRange(startDate: string | Date, durationMinutes: number) {
  const start = new Date(startDate)
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)

  const formatTime = (d: Date) => d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return `${formatTime(start)} - ${formatTime(end)}`
}

// 状态变更的动作描述
export function getStateChangeAction(oldState: string | null, newState: string) {
  if (oldState === null) {
    if (newState === 'pending') return '报名'
    if (newState === 'confirmed') return '加入'
    return '加入'
  }

  if (newState === 'confirmed') return '被确认'
  if (newState === 'removed') {
    if (oldState === 'confirmed') return '退出'
    if (oldState === 'pending') return '被移除'
    return '退出'
  }
  if (newState === 'pending') {
    if (oldState === 'removed') return '重新报名'
    return '报名'
  }
  if (newState === 'waitlisted') return '进入候补'

  return `${oldState || '无'} → ${newState}`
}
