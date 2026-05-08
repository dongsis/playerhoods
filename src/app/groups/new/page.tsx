import { getMyVenueIdentities } from '@/lib/api/identities'
import { getSavedRegisteredPlayerCandidates } from '@/lib/api/groups'
import { getContactPlayerResolution } from '@/lib/api/roster'
import { listSports } from '@/lib/api/sports'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { NewGroupForm } from './NewGroupForm'

export default async function NewGroupPage() {
  const user = await getUser()
  const supabase = await createSupabaseServerClient()
  const [sports, myIdentities, contacts, invitableUsers] = await Promise.all([
    listSports(supabase),
    user ? getMyVenueIdentities(supabase, user.id) : Promise.resolve([]),
    user ? getContactPlayerResolution(supabase) : Promise.resolve([]),
    user ? getSavedRegisteredPlayerCandidates(supabase) : Promise.resolve([]),
  ])

  return (
    <NewGroupForm
      sports={sports}
      venues={myIdentities.map((identity) => identity.venue)}
      invitableUsers={invitableUsers}
      contacts={contacts.map((contact) => ({
        guest_id: contact.guest_id,
        display_name: contact.display_name,
      }))}
    />
  )
}
