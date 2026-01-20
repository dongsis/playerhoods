import { createClient } from './client'
import {
  DEV_USERS,
  isDevMode,
  getDevUserIdFromStorage,
} from '@/lib/dev-user'

/**
 * 客户端获取当前用户 - 支持开发模式用户切换
 *
 * 在开发环境下，如果设置了 DEV_USER_ID，
 * 则返回对应的测试用户，否则返回真实登录用户
 */
export async function getCurrentUserClient() {
  const supabase = createClient()

  // 开发模式：检查是否有 dev user 切换
  if (isDevMode()) {
    const devUserId = getDevUserIdFromStorage()

    if (devUserId) {
      const devUser = DEV_USERS.find(u => u.id === devUserId)
      if (devUser) {
        // 返回模拟的用户对象
        return {
          user: {
            id: devUser.id,
            email: devUser.email,
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
