/* eslint-disable no-console */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.test' })

import assert from 'node:assert/strict'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

type UUID = string

function env(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

const SUPABASE_URL = env('SUPABASE_URL')
const SUPABASE_ANON_KEY = env('SUPABASE_ANON_KEY')
const SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY')

const TEST_MATCH_ID = env('TEST_MATCH_ID') as UUID

const creds = {
  org: { email: env('TEST_ORG_EMAIL'), password: env('TEST_ORG_PASSWORD') },
  p1: { email: env('TEST_P1_EMAIL'), password: env('TEST_P1_PASSWORD') },
  u2: { email: env('TEST_U2_EMAIL'), password: env('TEST_U2_PASSWORD') },
  u3: { email: env('TEST_U3_EMAIL'), password: env('TEST_U3_PASSWORD') },
}

type MPRow = {
  id: UUID
  match_id: UUID
  user_id: UUID | null
  guest_id: UUID | null
  status: 'pending' | 'confirmed' | 'removed'
  join_method: 'requested' | 'invited'
  nominated_by: UUID | null
  user_accepted_at: string | null
  org_approved_at: string | null
  removed_by: UUID | null
}

function isConfirmedDerived(mp: MPRow | null): boolean {
  if (!mp) return false
  return mp.status !== 'removed' && !!mp.user_accepted_at && !!mp.org_approved_at
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function loginClient(email: string, password: string): Promise<SupabaseClient> {
  const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  assert.ok(data.session?.access_token, 'No access token')
  // Bind token to a new client instance (cleaner for RPC calls)
  const authed = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return authed
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function getUserIdByEmail(label: 'ORG' | 'P1' | 'U2' | 'U3', email: string): Promise<UUID> {
  const envKey = `TEST_${label}_USER_ID`
  const fromEnv = process.env[envKey]
  if (fromEnv) return fromEnv as UUID

  // Fallback: only works if profiles has email
  const { data, error } = await admin
    .from('profiles')
    .select('id,email')
    .eq('email', email)
    .maybeSingle()

  if (!error && data?.id) return data.id as UUID

  throw new Error(`Cannot resolve user id. Set ${envKey} in .env.test (recommended).`)
}

async function fetchMpByUser(matchId: UUID, userId: UUID): Promise<MPRow | null> {
  const { data, error } = await admin
    .from('match_participants')
    .select(
      'id,match_id,user_id,guest_id,status,join_method,nominated_by,user_accepted_at,org_approved_at,removed_by'
    )
    .eq('match_id', matchId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return (data as MPRow) ?? null
}

async function cleanup(matchId: UUID, userIds: UUID[]) {
  // Best-effort cleanup: remove existing rows for these users in this match.
  // If you prefer "same-row reactivation only" even for tests, you can keep rows and only set to removed.
  const { error } = await admin.from('match_participants').delete().eq('match_id', matchId).in('user_id', userIds)
  if (error) {
    console.warn('cleanup warning:', error.message)
  }
}

async function rpc(c: SupabaseClient, fn: string, params: Record<string, any>) {
  const { data, error } = await c.rpc(fn, params)
  if (error) {
    throw new Error(`[RPC ${fn}] ${error.message} | params=${JSON.stringify(params)}`)
  }
  return data
}


async function expectThrows(p: Promise<any>, contains?: string) {
  let ok = false
  try {
    await p
  } catch (e: any) {
    ok = true
    if (contains) {
      const msg = String(e?.message ?? e)
      assert.ok(msg.includes(contains), `Expected error to include "${contains}", got "${msg}"`)
    }
  }
  assert.ok(ok, 'Expected call to throw, but it did not')
}

type Test = { name: string; run: () => Promise<void> }

async function main() {
  console.log('=== v1.3 Admission Tests ===')

  const orgClient = await loginClient(creds.org.email, creds.org.password)
  const p1Client = await loginClient(creds.p1.email, creds.p1.password)
  const u2Client = await loginClient(creds.u2.email, creds.u2.password)
  const u3Client = await loginClient(creds.u3.email, creds.u3.password)

  // Resolve user IDs (assumes profiles.email exists)
  const ORG_ID = await getUserIdByEmail('ORG', creds.org.email)
  const P1_ID  = await getUserIdByEmail('P1',  creds.p1.email)
  const U2_ID  = await getUserIdByEmail('U2',  creds.u2.email)
  const U3_ID  = await getUserIdByEmail('U3',  creds.u3.email)

  await cleanup(TEST_MATCH_ID, [ORG_ID, P1_ID, U2_ID, U3_ID])

  const tests: Test[] = []

  // 1) Invite → user accept → org confirm → confirmed(derived)
  tests.push({
    name: 'Invite happy: invite → accept → confirm',
    run: async () => {
  await rpc(orgClient, 'rpc_match_invite_user', { p_match_id: TEST_MATCH_ID, p_user_id: U2_ID })
  await rpc(u2Client, 'rpc_match_accept_invite', { p_match_id: TEST_MATCH_ID })

  const mp = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp, 'mp missing before org approve')

  await rpc(orgClient, 'rpc_match_org_approve_participant', { p_match_participant_id: mp.id })

  const mp2 = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp2, 'mp missing after org approve')
  assert.equal(mp2.join_method, 'invited')
  assert.ok(mp2.user_accepted_at, 'user_accepted_at missing')
  assert.ok(mp2.org_approved_at, 'org_approved_at missing')
  assert.ok(isConfirmedDerived(mp2), 'should be derived confirmed')
},

  })

  // 2) Invite → org remove → user accept must fail
  tests.push({
    name: 'Invite denial: org remove blocks user accept',
    run: async () => {
  await cleanup(TEST_MATCH_ID, [U2_ID])

  await rpc(orgClient, 'rpc_match_invite_user', { p_match_id: TEST_MATCH_ID, p_user_id: U2_ID })

  const mp = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp, 'mp missing after invite')

  await rpc(orgClient, 'rpc_match_remove_participant', { p_match_participant_id: mp.id })

  await expectThrows(
    rpc(u2Client, 'rpc_match_accept_invite', { p_match_id: TEST_MATCH_ID })
  )

  const mp2 = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp2, 'mp missing')
  assert.equal(mp2.status, 'removed')
},

  })

  // 3) Nominate → user accept → org confirm → confirmed(derived)
  // Ensure P1 is confirmed participant for nominate tests
await rpc(orgClient, 'rpc_match_invite_user', {
  p_match_id: TEST_MATCH_ID,
  p_user_id: P1_ID,
})
await rpc(p1Client, 'rpc_match_accept_invite', {
  p_match_id: TEST_MATCH_ID,
})
const mpP1 = await fetchMpByUser(TEST_MATCH_ID, P1_ID)
assert.ok(mpP1, 'P1 mp missing')
await rpc(orgClient, 'rpc_match_org_approve_participant', {
  p_match_participant_id: mpP1.id,
})
const mpP1_check = await fetchMpByUser(TEST_MATCH_ID, P1_ID)
console.log('P1 MP after setup:', mpP1_check)
console.log('P1 derived-confirm?', isConfirmedDerived(mpP1_check))

  tests.push({
    name: 'Nominate happy: nominate → accept → confirm',
    run: async () => {
  await cleanup(TEST_MATCH_ID, [U3_ID])

  await rpc(p1Client, 'rpc_match_nominate_user', { p_match_id: TEST_MATCH_ID, p_user_id: U3_ID })

  let mp = await fetchMpByUser(TEST_MATCH_ID, U3_ID)
  assert.ok(mp, 'mp missing after nominate')
  assert.equal(mp.join_method, 'requested')
  assert.ok(mp.nominated_by, 'nominated_by missing (must classify nominate)')
  assert.equal(mp.user_accepted_at, null)

  await rpc(u3Client, 'rpc_match_accept_invite', { p_match_id: TEST_MATCH_ID })

  mp = await fetchMpByUser(TEST_MATCH_ID, U3_ID)
  assert.ok(mp, 'mp missing before org approve')

  await rpc(orgClient, 'rpc_match_org_approve_participant', { p_match_participant_id: mp.id })

  const mp2 = await fetchMpByUser(TEST_MATCH_ID, U3_ID)
  assert.ok(mp2, 'mp missing after org approve')
  assert.ok(mp2.user_accepted_at, 'user_accepted_at missing')
  assert.ok(mp2.org_approved_at, 'org_approved_at missing')
  assert.ok(isConfirmedDerived(mp2), 'should be derived confirmed')
},

  })

  // 4) Nominate → org remove → user accept must fail
  tests.push({
    name: 'Nominate denial: org remove blocks accept',
    run: async () => {
  await cleanup(TEST_MATCH_ID, [U3_ID])

  await rpc(p1Client, 'rpc_match_nominate_user', { p_match_id: TEST_MATCH_ID, p_user_id: U3_ID })

  const mp = await fetchMpByUser(TEST_MATCH_ID, U3_ID)
  assert.ok(mp, 'mp missing after nominate')

  await rpc(orgClient, 'rpc_match_remove_participant', { p_match_participant_id: mp.id })

  await expectThrows(rpc(u3Client, 'rpc_match_accept_invite', { p_match_id: TEST_MATCH_ID }))

  const mp2 = await fetchMpByUser(TEST_MATCH_ID, U3_ID)
  assert.ok(mp2 && mp2.status === 'removed')
},

  })

  // 5) Confirmed → user leave → removed, and reconcile must not override removed
  tests.push({
    name: 'Leave: confirmed user leaves → removed (sticky)',
    run: async () => {
  await cleanup(TEST_MATCH_ID, [U2_ID])

  await rpc(orgClient, 'rpc_match_invite_user', { p_match_id: TEST_MATCH_ID, p_user_id: U2_ID })
  await rpc(u2Client, 'rpc_match_accept_invite', { p_match_id: TEST_MATCH_ID })

  const mp = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp, 'mp missing before org approve')

  await rpc(orgClient, 'rpc_match_org_approve_participant', { p_match_participant_id: mp.id })

  const before = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(before && isConfirmedDerived(before))

  await rpc(u2Client, 'rpc_match_user_withdraw', { p_match_id: TEST_MATCH_ID })

  const after = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(after, 'mp missing')
  assert.equal(after.status, 'removed')
},

  })

  // 6) Reactivate: org removed → org reactivate restores pending without modifying confirmation fields
  tests.push({
    name: 'Reactivate: org-removed requires org reactivation; reactivation keeps confirm fields',
    run: async () => {
  await cleanup(TEST_MATCH_ID, [U2_ID])

  await rpc(orgClient, 'rpc_match_invite_user', { p_match_id: TEST_MATCH_ID, p_user_id: U2_ID })
  await rpc(u2Client, 'rpc_match_accept_invite', { p_match_id: TEST_MATCH_ID })

  let mp = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp, 'mp missing after accept')
  assert.ok(mp.user_accepted_at, 'user_accepted_at missing')

  await rpc(orgClient, 'rpc_match_remove_participant', { p_match_participant_id: mp.id })

  mp = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp, 'mp missing after remove')
  assert.equal(mp.status, 'removed')

  await expectThrows(rpc(u2Client, 'rpc_match_accept_invite', { p_match_id: TEST_MATCH_ID }))

  await rpc(orgClient, 'rpc_match_reactivate_participant', { p_match_participant_id: mp.id })

  const mp2 = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp2, 'mp missing after reactivate')
  assert.equal(mp2.status, 'confirmed')
  assert.equal(mp2.user_accepted_at, mp.user_accepted_at)
  assert.equal(mp2.org_approved_at, mp.org_approved_at)
},

  })

  // 7) Non-ORG cannot reactivate
  tests.push({
    name: 'Permission: non-ORG cannot reactivate',
    run: async () => {
  await cleanup(TEST_MATCH_ID, [U2_ID])

  await rpc(orgClient, 'rpc_match_invite_user', { p_match_id: TEST_MATCH_ID, p_user_id: U2_ID })

  const mp = await fetchMpByUser(TEST_MATCH_ID, U2_ID)
  assert.ok(mp, 'mp missing after invite')

  await rpc(orgClient, 'rpc_match_remove_participant', { p_match_participant_id: mp.id })

  await expectThrows(
    rpc(u2Client, 'rpc_match_reactivate_participant', { p_match_participant_id: mp.id })
  )
},

  })

  // Run tests
  let pass = 0
  for (const t of tests) {
    process.stdout.write(`- ${t.name} ... `)
    try {
      await t.run()
      console.log('PASS')
      pass++
    } catch (e: any) {
      console.log('FAIL')
      console.error('  ', String(e?.message ?? e))
    }
    // small delay to reduce accidental rate limits
    await sleep(150)
  }
  console.log('Resolved IDs', { ORG_ID, P1_ID, U2_ID, U3_ID })

  console.log(`\nResult: ${pass}/${tests.length} passed`)
  if (pass !== tests.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
