'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { replaceGroupLocations, type GroupLocationInput } from '@/lib/api/groups'

interface GroupResult {
  id: string
  name: string
  description: string | null
  boundary_keeper_id: string
  created_by: string
  created_at: string
  primary_sport_id: number | null
  venue_id: string | null
  icon_key: string
  recommended_level_min: number | null
  recommended_level_max: number | null
}

export async function createGroupAction(input: {
  name: string
  description?: string
  primary_sport_id?: number | null
  venue_id?: string | null
  icon_key?: string | null
  recommended_level_min?: number | null
  recommended_level_max?: number | null
  locations?: GroupLocationInput[]
}): Promise<GroupResult> {
  const supabase = await createSupabaseServerClient()

  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr) throw userErr
  if (!user) throw new Error('not_authenticated')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('rpc_group_create', {
    p_name: input.name.trim(),
    p_description: (input.description ?? '').trim() || null,
    p_primary_sport_id: input.primary_sport_id ?? null,
    p_venue_id: input.venue_id ?? null,
    p_icon_key: input.icon_key ?? null,
    p_recommended_level_min: input.recommended_level_min ?? null,
    p_recommended_level_max: input.recommended_level_max ?? null,
  })

  if (error) throw error
  if (!data) throw new Error('No data returned from RPC')

  // RPC returns a groups row - ensure we return it as GroupResult
  const group = data as GroupResult
  if (!group.id) {
    throw new Error(`Invalid group data returned: ${JSON.stringify(data)}`)
  }

  if (input.locations && input.locations.length > 0) {
    await replaceGroupLocations(supabase, group.id, input.locations)
    const primaryVenueLocation = input.locations.find((location) => location.kind === 'venue' && location.is_primary)
    const firstVenueLocation = input.locations.find((location) => location.kind === 'venue')
    const primaryVenueId =
      primaryVenueLocation && primaryVenueLocation.kind === 'venue'
        ? primaryVenueLocation.venue_id
        : firstVenueLocation && firstVenueLocation.kind === 'venue'
          ? firstVenueLocation.venue_id
          : null
    if (primaryVenueId) {
      group.venue_id = primaryVenueId
    }
  }

  return group
}
