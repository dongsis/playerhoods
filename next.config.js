/** @type {import('next').NextConfig} */
const explicitDistDir = process.env.NEXT_DIST_DIR?.trim()
const defaultDistDir = process.env.NODE_ENV === 'development' ? '.next-dev' : '.next-build'
const distDir = explicitDistDir || defaultDistDir

const nextConfig = {
  // App Router is enabled by default in Next.js 13.4+
  // Allow both localhost and 127.0.0.1 to access the dev server.
  allowedDevOrigins: ['localhost', '127.0.0.1'],
  ...(distDir ? { distDir } : {}),
}

module.exports = nextConfig
