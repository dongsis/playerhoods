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
