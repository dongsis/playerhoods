import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <span className="text-white font-bold text-lg">P</span>
            </div>
            <span className="font-semibold text-xl">PlayerHoods</span>
          </Link>
          
          <nav className="flex items-center gap-4">
            {user ? (
              <>
                <Link 
                  href="/matches" 
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  球局
                </Link>
                <Link 
                  href="/matches/create" 
                  className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
                >
                  发起球局
                </Link>
              </>
            ) : (
              <>
                <Link 
                  href="/login" 
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  登录
                </Link>
                <Link 
                  href="/signup" 
                  className="bg-primary-500 text-white px-4 py-2 rounded-lg hover:bg-primary-600 transition-colors"
                >
                  注册
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            约球，<span className="text-primary-500">简单点</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            PlayerHoods 帮你轻松组织网球局。发布球局、管理报名、处理候补，一切尽在掌握。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <>
                <Link 
                  href="/matches/create"
                  className="bg-primary-500 text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-primary-600 transition-colors shadow-lg shadow-primary-500/25"
                >
                  发起球局
                </Link>
                <Link 
                  href="/matches"
                  className="bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-medium hover:bg-gray-50 transition-colors border border-gray-200"
                >
                  查看球局
                </Link>
              </>
            ) : (
              <>
                <Link 
                  href="/signup"
                  className="bg-primary-500 text-white px-8 py-4 rounded-xl text-lg font-medium hover:bg-primary-600 transition-colors shadow-lg shadow-primary-500/25"
                >
                  免费注册
                </Link>
                <Link 
                  href="/login"
                  className="bg-white text-gray-900 px-8 py-4 rounded-xl text-lg font-medium hover:bg-gray-50 transition-colors border border-gray-200"
                >
                  已有账号？登录
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">为什么选择 PlayerHoods？</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon="📋"
              title="简单发布"
              description="几秒钟创建球局，设置时间、地点、人数，一键分享邀请链接"
            />
            <FeatureCard 
              icon="✅"
              title="灵活审批"
              description="组织者完全掌控报名审批，确认、候补、递补，随时调整"
            />
            <FeatureCard 
              icon="🔔"
              title="及时通知"
              description="重要变更即时通知，确认、递补、时间变更，不错过任何消息"
            />
          </div>
        </div>
      </section>

      {/* Game Types Section */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">支持多种球局类型</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <GameTypeCard 
              type="单打"
              description="1v1 对决"
              color="bg-court-hard"
            />
            <GameTypeCard 
              type="双打"
              description="男双 / 女双 / 混双"
              color="bg-court-green"
            />
            <GameTypeCard 
              type="练球"
              description="自由练习，人数不限"
              color="bg-court-clay"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-gray-100">
        <div className="max-w-6xl mx-auto text-center text-gray-500">
          <p>© 2024 PlayerHoods. All rights reserved.</p>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({ icon, title, description }: { 
  icon: string
  title: string
  description: string 
}) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="text-4xl mb-4">{icon}</div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  )
}

function GameTypeCard({ type, description, color }: {
  type: string
  description: string
  color: string
}) {
  return (
    <div className={`${color} text-white p-6 rounded-2xl`}>
      <h3 className="text-2xl font-bold mb-2">{type}</h3>
      <p className="text-white/80">{description}</p>
    </div>
  )
}
