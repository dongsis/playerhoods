import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { DevUserSwitch } from '@/components/DevUserSwitch'
import { ToastProvider } from '@/components/Toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'PlayerHoods - 约球神器',
  description: '轻松组织网球局，告别繁琐的约球流程',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="font-sans antialiased">
        <ToastProvider>
          {children}
          <DevUserSwitch />
        </ToastProvider>
      </body>
    </html>
  )
}
