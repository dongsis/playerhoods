/**
 * Dev User Switch - 开发环境快速登录功能
 *
 * 仅在 NODE_ENV=development 时生效
 * 允许开发者快速切换不同的测试用户，方便测试多用户场景
 *
 * 使用方式：
 * 1. 先注册 2-3 个测试账号（使用下方预设的邮箱和密码）
 * 2. 点击 Dev Switch 按钮，选择要登录的测试用户
 * 3. 系统会自动登出当前用户并登录选中的测试用户
 */

// 预设的开发测试用户（需要先在系统中注册这些账号）
// 建议使用统一的测试密码，方便快速切换
export const DEV_USERS = [
  { email: 'test1@test.local', password: 'test123456', name: '测试用户 1' },
  { email: 'test2@test.local', password: 'test123456', name: '测试用户 2' },
  { email: 'test3@test.local', password: 'test123456', name: '测试用户 3' },
] as const

export type DevUser = typeof DEV_USERS[number]

export function isDevMode(): boolean {
  // 在客户端和服务端都能正确判断
  return process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_DEV_MODE === 'true'
}
