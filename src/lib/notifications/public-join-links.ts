import type { SupabaseClient } from '@supabase/supabase-js'

export type PublicJoinIntent = 'respond' | 'view' | 'change-response' | 'withdraw' | 'review-changes'

type PublicMatchSignupLinkRow = {
  public_token?: string | null
}

export function buildPublicJoinPath(publicToken: string, intent?: PublicJoinIntent): string {
  const path = `/join/${encodeURIComponent(publicToken)}`
  if (!intent) return path

  const query = new URLSearchParams({ intent })
  return `${path}?${query.toString()}`
}

export function addPublicJoinIntent(url: string, intent?: PublicJoinIntent): string {
  if (!intent) return url

  const fallbackOrigin = 'https://www.playerhoods.com'
  const isAbsolute = /^https?:\/\//i.test(url)
  const parsed = new URL(url, fallbackOrigin)
  parsed.searchParams.set('intent', intent)

  return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`
}

export async function resolvePublicJoinPathForMatch(
  supabase: SupabaseClient,
  matchId: string | null | undefined,
  intent?: PublicJoinIntent,
): Promise<string | null> {
  if (!matchId) return null

  const { data, error } = await supabase.rpc('rpc_public_match_signup_link_get_or_create', {
    p_match_id: matchId,
  })
  if (error) return null

  const rows = (data ?? []) as PublicMatchSignupLinkRow[]
  const publicToken = rows[0]?.public_token
  return publicToken ? buildPublicJoinPath(publicToken, intent) : null
}
