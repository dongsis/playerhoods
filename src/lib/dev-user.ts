/**
 * Dev User Switch - 开发环境用户切换功能
 *
 * 仅在 NODE_ENV=development 时生效
 * 允许开发者切换不同的测试用户身份，方便测试多用户场景
 */

// 预设的开发测试用户
export const DEV_USERS = [
  { id: 'dev-user-1', name: '测试用户 1', email: 'dev1@test.local' },
  { id: 'dev-user-2', name: '测试用户 2', email: 'dev2@test.local' },
  { id: 'dev-user-3', name: '测试用户 3', email: 'dev3@test.local' },
] as const

export type DevUser = typeof DEV_USERS[number]

export const DEV_USER_COOKIE_NAME = 'DEV_USER_ID'

export function isDevMode(): boolean {
  return process.env.NODE_ENV === 'development'
}

// 客户端：从 cookie 获取当前 dev user id
export function getDevUserIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null
  if (!isDevMode()) return null

  // 从 cookie 读取
  const match = document.cookie.match(new RegExp(`(^| )${DEV_USER_COOKIE_NAME}=([^;]+)`))
  return match ? match[2] : null
}

// 客户端：设置 dev user id 到 cookie（这样服务端也能读取）
export function setDevUserIdToStorage(userId: string | null): void {
  if (typeof window === 'undefined') return
  if (!isDevMode()) return

  if (userId) {
    // 设置 cookie，有效期 7 天
    document.cookie = `${DEV_USER_COOKIE_NAME}=${userId}; path=/; max-age=${7 * 24 * 60 * 60}`
  } else {
    // 删除 cookie
    document.cookie = `${DEV_USER_COOKIE_NAME}=; path=/; max-age=0`
  }
}

// 根据 id 获取 dev user 信息
export function getDevUserById(id: string): DevUser | undefined {
  return DEV_USERS.find(u => u.id === id)
}
