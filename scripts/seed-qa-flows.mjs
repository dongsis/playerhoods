import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const apply = process.argv.includes('--apply')
const supabaseUrl =
  process.env.SUPABASE_URL || process.env.SUPABASE_SERVER_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const qaUsers = [
  {
    key: 'hostA',
    email: 'qa-host-a@playerhoods.test',
    password: 'PlayerHoods-QA-2026!',
    profile: {
      display_name: 'Host A',
      discovery_volume: 'recommended',
      accepting_new_invites: true,
      plays_singles: true,
      plays_doubles: true,
    },
  },
  {
    key: 'playerB',
    email: 'qa-player-b@playerhoods.test',
    password: 'PlayerHoods-QA-2026!',
    profile: {
      display_name: 'Player B',
      discovery_volume: 'recommended',
      accepting_new_invites: true,
      plays_singles: true,
      plays_doubles: true,
    },
  },
  {
    key: 'playerC',
    email: 'qa-player-c-private@playerhoods.test',
    password: 'PlayerHoods-QA-2026!',
    profile: {
      display_name: 'Player C Strict Privacy',
      discovery_volume: 'quiet',
      accepting_new_invites: false,
      plays_singles: true,
      plays_doubles: false,
    },
  },
  {
    key: 'hostE',
    email: 'qa-host-e@playerhoods.test',
    password: 'PlayerHoods-QA-2026!',
    profile: {
      display_name: 'Host E',
      discovery_volume: 'playerhood',
      accepting_new_invites: true,
      plays_singles: false,
      plays_doubles: true,
    },
  },
]

function logPlan() {
  console.log('QA seed plan:')
  for (const user of qaUsers) {
    console.log(`- ${user.profile.display_name}: ${user.email}`)
  }
  console.log('- Contact D: unregistered email/phone contact owned by Host A')
  console.log('')
  console.log('Dry run only. Re-run with --apply to write using SUPABASE_SERVICE_ROLE_KEY.')
}

async function findUserByEmail(admin, email) {
  let page = 1
  const perPage = 1000

  while (true) {
    const { data, error } = await admin.listUsers({ page, perPage })
    if (error) throw error

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (found) return found
    if (data.users.length < perPage) return null
    page += 1
  }
}

async function upsertUser(supabase, userSpec) {
  const existing = await findUserByEmail(supabase.auth.admin, userSpec.email)
  let user = existing

  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: userSpec.email,
      password: userSpec.password,
      email_confirm: true,
      user_metadata: { qa_seed: true, qa_key: userSpec.key },
    })
    if (error) throw error
    user = data.user
  }

  const now = new Date().toISOString()
  const { error: profileError } = await supabase.from('profiles').upsert({
    id: user.id,
    first_name: '',
    last_name: '',
    display_name: userSpec.profile.display_name,
    availability_status: 'available',
    onboarding_profile_completed: true,
    onboarding_completed: true,
    age_confirmed_at: now,
    terms_accepted_at: now,
    privacy_accepted_at: now,
    responsible_use_accepted_at: now,
    contact_email: userSpec.email,
    contact_channel: 'email',
    ...userSpec.profile,
  })
  if (profileError) throw profileError

  return user
}

async function main() {
  if (!apply) {
    logPlan()
    return
  }

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for --apply.')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const users = {}
  for (const userSpec of qaUsers) {
    users[userSpec.key] = await upsertUser(supabase, userSpec)
    console.log(`Seeded ${userSpec.profile.display_name}: ${users[userSpec.key].id}`)
  }

  const { data: person, error: personError } = await supabase
    .from('people')
    .insert({
      display_name: 'Contact D',
      person_type: 'limited_contact',
      status: 'active',
      primary_sport_id: 1,
    })
    .select('person_id')
    .single()
  if (personError) throw personError

  const { data: guest, error: guestError } = await supabase
    .from('guests')
    .insert({
      display_name: 'Contact D',
      email: 'qa-contact-d@example.test',
      phone: '+15555550104',
      created_by: users.hostA.id,
      person_id: person.person_id,
      status: 'active',
      gender: 'unspecified',
      availability_status: 'available',
    })
    .select('id')
    .single()
  if (guestError) throw guestError

  const { error: contactError } = await supabase.from('contact_records').insert({
    owner_user_id: users.hostA.id,
    person_id: person.person_id,
    guest_id: guest.id,
    raw_name: 'Contact D',
    raw_email: 'qa-contact-d@example.test',
    raw_phone: '+15555550104',
    owner_notes: 'QA unregistered contact. Do not expose outside owner surfaces.',
    source: 'qa_seed',
  })
  if (contactError) throw contactError

  const { error: relationError } = await supabase.from('person_relationships').insert({
    actor_user_id: users.hostA.id,
    person_id: person.person_id,
    relationship_type: 'saved',
  })
  if (relationError) throw relationError

  console.log(`Seeded Contact D person=${person.person_id} guest=${guest.id}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
