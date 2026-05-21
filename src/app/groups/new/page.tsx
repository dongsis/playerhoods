import { getMyVenueRelationships } from '@/lib/api/identities'
import { getSavedRegisteredPlayerCandidates } from '@/lib/api/groups'
import { getContactPlayerResolution } from '@/lib/api/roster'
import { listSports } from '@/lib/api/sports'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import type { Profile } from '@/lib/types/database'
import { NewGroupForm } from './NewGroupForm'

export default async function NewGroupPage() {
  const user = await getUser()
  const supabase = await createSupabaseServerClient()
  const [sports, profileResult, myVenueRelationships, contacts, invitableUsers] = await Promise.all([
    listSports(supabase),
    user
      ? supabase.from('profiles').select('primary_venue_id').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    user ? getMyVenueRelationships(supabase, user.id) : Promise.resolve([]),
    user ? getContactPlayerResolution(supabase) : Promise.resolve([]),
    user ? getSavedRegisteredPlayerCandidates(supabase) : Promise.resolve([]),
  ])
  if (profileResult.error) throw profileResult.error
  const primaryVenueId = ((profileResult.data ?? null) as Pick<Profile, 'primary_venue_id'> | null)?.primary_venue_id ?? null
  const myMemberVenues = myVenueRelationships
    .filter((relationship) => relationship.relationship_type === 'member')
    .map((relationship) => ({
      ...relationship.venue,
      is_primary: relationship.venue_id === primaryVenueId,
    }))
    .sort((a, b) => Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) || a.name.localeCompare(b.name))

  return (
    <NewGroupForm
      sports={sports}
      venues={myMemberVenues}
      invitableUsers={invitableUsers}
      contacts={contacts.map((contact) => ({
        guest_id: contact.guest_id,
        display_name: contact.display_name,
      }))}
    />
  )
}
