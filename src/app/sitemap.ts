import type { MetadataRoute } from 'next'
import { listPublicVenueSitemapRows } from '@/lib/api/venues'
import { createSupabasePublicServerClient } from '@/lib/supabase/server'
import { getAbsoluteUrl } from '@/lib/site-url'

export const revalidate = 86400

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: getAbsoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: getAbsoluteUrl('/venues'),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: getAbsoluteUrl('/about'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]

  const supabaseUrl = process.env.SUPABASE_SERVER_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    return staticEntries
  }

  const supabase = createSupabasePublicServerClient()
  const venueRows = await listPublicVenueSitemapRows(supabase).catch((error) => {
    console.error('Failed to build venue sitemap entries', error)
    return []
  })

  const venueEntries: MetadataRoute.Sitemap = venueRows
    .filter((row) => row.canonical_path)
    .map((row) => ({
      url: getAbsoluteUrl(row.canonical_path),
      lastModified: row.created_at ? new Date(row.created_at) : undefined,
      changeFrequency: 'weekly',
      priority: row.supports_tennis ? 0.7 : 0.6,
    }))

  return [...staticEntries, ...venueEntries]
}
