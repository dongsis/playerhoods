import { cookies } from 'next/headers'
import { createClient } from './server'
import { DEV_USER_COOKIE_NAME, DEV_USERS, isDevMode } from '@/lib/dev-user'

/**
 * 获取当前用户 - 支持开发模式用户切换
 *
 * 在开发环境下，如果设置了 DEV_USER_ID cookie/header，
 * 则返回对应的测试用户，否则返回真实登录用户
 */
export async function getCurrentUser() {
  const supabase = await createClient()

  // 开发模式：检查是否有 dev user 切换
  if (isDevMode()) {
    const cookieStore = await cookies()
    const devUserId = cookieStore.get(DEV_USER_COOKIE_NAME)?.value

    if (devUserId) {
      const devUser = DEV_USERS.find(u => u.id === devUserId)
      if (devUser) {
        // 返回模拟的用户对象，结构与 supabase auth user 兼容
        return {
          user: {
            id: devUser.id,
            email: devUser.email,
            // 标记这是开发测试用户
            app_metadata: { dev_user: true },
            user_metadata: { display_name: devUser.name },
          },
          isDevUser: true,
        }
      }
    }
  }

  // 正常流程：获取真实登录用户
  const { data: { user } } = await supabase.auth.getUser()

  return {
    user,
    isDevUser: false,
  }
}

/**
 * 获取当前用户 ID - 简化版本
 *
 * 如果用户未登录且不是开发测试用户，返回 null
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { user } = await getCurrentUser()
  return user?.id ?? null
}
