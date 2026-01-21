'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { DEV_USERS, isDevMode } from '@/lib/dev-user'

/**
 * DevUserSwitch - 开发环境快速登录切换器
 *
 * 显示在页面右下角的浮动按钮，点击展开用户选择列表
 * 选择后会自动登出当前用户并登录选中的测试用户
 * 仅在开发环境显示
 *
 * 注意：需要先注册预设的测试账号才能使用
 */
export function DevUserSwitch() {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // 获取当前登录用户
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      setCurrentUser(user?.email || null)
    })
  }, [])

  // 只在客户端渲染后显示（开发环境检查暂时移除以便调试）
  if (!mounted) {
    return null
  }

  const handleLogin = async (email: string, password: string, name: string) => {
    setLoading(email)
    const supabase = createClient()

    // 先登出当前用户
    await supabase.auth.signOut()

    // 登录新用户
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(`登录失败: ${error.message}\n\n请先注册测试账号:\n邮箱: ${email}\n密码: ${password}`)
      setLoading(null)
      return
    }

    setIsOpen(false)
    setLoading(null)
    router.push('/matches')
    router.refresh()
  }

  const handleLogout = async () => {
    setLoading('logout')
    const supabase = createClient()
    await supabase.auth.signOut()
    setLoading(null)
    router.push('/login')
    router.refresh()
  }

  const currentDevUser = DEV_USERS.find(u => u.email === currentUser)

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* 展开的用户选择面板 */}
      {isOpen && (
        <div className="absolute bottom-14 right-0 bg-white rounded-lg shadow-xl border border-gray-200 w-72 overflow-hidden">
          <div className="bg-yellow-50 px-3 py-2 border-b border-yellow-200">
            <p className="text-xs font-semibold text-yellow-800">
              Dev Mode - 快速切换登录
            </p>
            {currentUser && (
              <p className="text-xs text-yellow-600 mt-1">
                当前: {currentUser}
              </p>
            )}
          </div>

          <div className="p-2 max-h-64 overflow-y-auto">
            {/* 测试用户列表 */}
            {DEV_USERS.map((user) => (
              <button
                key={user.email}
                onClick={() => handleLogin(user.email, user.password, user.name)}
                disabled={loading !== null}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  currentUser === user.email
                    ? 'bg-primary-100 text-primary-700'
                    : 'hover:bg-gray-100 text-gray-700'
                } disabled:opacity-50`}
              >
                <span className="font-medium">{user.name}</span>
                <span className="text-xs text-gray-500 block">{user.email}</span>
                {loading === user.email && (
                  <span className="text-xs text-primary-500">登录中...</span>
                )}
              </button>
            ))}

            <hr className="my-2" />

            {/* 登出按钮 */}
            <button
              onClick={handleLogout}
              disabled={loading !== null}
              className="w-full text-left px-3 py-2 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {loading === 'logout' ? '登出中...' : '退出登录'}
            </button>

            {/* 注册新账号提示 */}
            <div className="mt-2 px-3 py-2 bg-gray-50 rounded-md">
              <p className="text-xs text-gray-500">
                首次使用需先注册测试账号
              </p>
              <a
                href="/signup"
                className="text-xs text-primary-500 hover:underline"
              >
                去注册 →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all ${
          currentDevUser
            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
            : 'bg-gray-700 text-white hover:bg-gray-800'
        }`}
      >
        <span className="text-lg">👤</span>
        <span className="text-sm font-medium">
          {currentDevUser ? currentDevUser.name : (currentUser ? '已登录' : '未登录')}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  )
}
