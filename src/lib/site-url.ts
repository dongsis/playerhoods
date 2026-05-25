const DEFAULT_SITE_ORIGIN = 'https://www.playerhoods.com'

function getConfiguredSiteOriginCandidate(): string | null {
  const explicit =
    process.env.NEXT_PUBLIC_SITE_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || process.env.APP_URL?.trim()
    || process.env.BASE_URL?.trim()
    || process.env.SITE_URL?.trim()

  if (explicit) return explicit
  if (process.env.VERCEL_URL?.trim()) return `https://${process.env.VERCEL_URL.trim()}`
  return null
}

export function getSiteOrigin(): string {
  const configured = getConfiguredSiteOriginCandidate()
  if (!configured) return DEFAULT_SITE_ORIGIN

  try {
    const origin = new URL(configured).origin
    const hostname = new URL(origin).hostname.toLowerCase()
    const isProductionBuild = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production'

    if (isProductionBuild && (hostname === 'localhost' || hostname === '127.0.0.1')) {
      return DEFAULT_SITE_ORIGIN
    }

    return origin
  } catch {
    return DEFAULT_SITE_ORIGIN
  }
}

export function getAbsoluteUrl(path: string): string {
  const origin = getSiteOrigin()
  return new URL(path.startsWith('/') ? path : `/${path}`, origin).toString()
}
