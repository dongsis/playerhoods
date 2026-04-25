/** @type {import('next').NextConfig} */
const explicitDistDir = process.env.NEXT_DIST_DIR?.trim()
const defaultDistDir = process.env.NODE_ENV === 'development' ? '.next-dev' : '.next-build'
const distDir = explicitDistDir || defaultDistDir

const nextConfig = {
  // App Router is enabled by default in Next.js 13.4+
  // Allow local LAN testing hosts to access the dev server in addition to loopback.
  allowedDevOrigins: ['localhost', '127.0.0.1', '192.168.4.41'],
  ...(distDir ? { distDir } : {}),
}

module.exports = nextConfig
