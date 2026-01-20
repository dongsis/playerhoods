'use client'

import { useState, useEffect } from 'react'
import {
  DEV_USERS,
  isDevMode,
  getDevUserIdFromStorage,
  setDevUserIdToStorage,
  getDevUserById,
} from '@/lib/dev-user'

/**
 * DevUserSwitch - 开发环境用户切换器
 *
 * 显示在页面右下角的浮动按钮，点击展开用户选择列表
 * 仅在开发环境显示
 */
export function DevUserSwitch() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentDevUserId, setCurrentDevUserId] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setCurrentDevUserId(getDevUserIdFromStorage())
  }, [])

  // 只在开发环境且客户端渲染后显示
  if (!mounted || !isDevMode()) {
    return null
  }

  const currentDevUser = currentDevUserId ? getDevUserById(currentDevUserId) : null

  const handleSelect = (userId: string | null) => {
    setDevUserIdToStorage(userId)
    setCurrentDevUserId(userId)
    setIsOpen(false)
    // 刷新页面以使新身份生效
    window.location.reload()
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* 展开的用户选择面板 */}
      {isOpen && (
        <div className="absolute bottom-14 right-0 bg-white rounded-lg shadow-xl border border-gray-200 w-64 overflow-hidden">
          <div className="bg-yellow-50 px-3 py-2 border-b border-yellow-200">
            <p className="text-xs font-semibold text-yellow-800">🔧 开发模式 - 切换用户</p>
          </div>

          <div className="p-2">
            {/* 使用真实登录的用户 */}
            <button
              onClick={() => handleSelect(null)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                !currentDevUserId
                  ? 'bg-primary-100 text-primary-700'
                  : 'hover:bg-gray-100 text-gray-700'
              }`}
            >
              <span className="font-medium">真实用户</span>
              <span className="text-xs text-gray-500 block">使用实际登录的账号</span>
            </button>

            <hr className="my-2" />

            {/* 测试用户列表 */}
            {DEV_USERS.map((user) => (
              <button
                key={user.id}
                onClick={() => handleSelect(user.id)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  currentDevUserId === user.id
                    ? 'bg-primary-100 text-primary-700'
                    : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <span className="font-medium">{user.name}</span>
                <span className="text-xs text-gray-500 block">{user.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 触发按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-4 py-2 rounded-full shadow-lg transition-all ${
          currentDevUserId
            ? 'bg-yellow-500 text-white hover:bg-yellow-600'
            : 'bg-gray-700 text-white hover:bg-gray-800'
        }`}
      >
        <span className="text-lg">👤</span>
        <span className="text-sm font-medium">
          {currentDevUser ? currentDevUser.name : '真实用户'}
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
