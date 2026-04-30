import { getMyVenueIdentities } from '@/lib/api/identities'
import { getContactPlayerResolution } from '@/lib/api/roster'
import { listSports } from '@/lib/api/sports'
import { createSupabaseServerClient, getUser } from '@/lib/supabase/server'
import { NewGroupForm } from './NewGroupForm'

export default async function NewGroupPage() {
  const user = await getUser()
  const supabase = await createSupabaseServerClient()
  const [sports, myIdentities, contacts, usersRes] = await Promise.all([
    listSports(supabase),
    user ? getMyVenueIdentities(supabase, user.id) : Promise.resolve([]),
    user ? getContactPlayerResolution(supabase) : Promise.resolve([]),
    user
      ? supabase
          .from('profile_display')
          .select('id, display_name')
          .neq('id', user.id)
          .order('display_name', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  return (
    <NewGroupForm
      sports={sports}
      venues={myIdentities.map((identity) => identity.venue)}
      invitableUsers={(usersRes.data ?? []) as { id: string; display_name: string }[]}
      contacts={contacts.map((contact) => ({
        guest_id: contact.guest_id,
        display_name: contact.display_name,
      }))}
    />
  )
}
