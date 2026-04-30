/** @type {import('next').NextConfig} */
const explicitDistDir = process.env.NEXT_DIST_DIR?.trim()
const isVercel = process.env.VERCEL === '1' || process.env.NOW_REGION
const defaultDistDir = isVercel
  ? '.next'
  : process.env.NODE_ENV === 'development'
    ? '.next-dev'
    : '.next-build'
const distDir = explicitDistDir || defaultDistDir

const nextConfig = {
  // App Router is enabled by default in Next.js 13.4+
  // Allow local LAN testing hosts to access the dev server in addition to loopback.
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.4.41'],
  ...(distDir ? { distDir } : {}),
  async rewrites() {
    const browserSupabaseProxyBase = process.env.SUPABASE_BROWSER_PROXY_TARGET?.trim()
      || process.env.SUPABASE_SERVER_URL?.trim()
      || 'http://127.0.0.1:55321'

    return [
      {
        source: '/supabase/:path*',
        destination: `${browserSupabaseProxyBase}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
