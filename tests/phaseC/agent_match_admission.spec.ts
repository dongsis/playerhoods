import { test, expect } from '@playwright/test'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.phasec' })

import { skillLogin } from './skills/login'
import { skillCreateMatchAndGetId } from './skills/match_create'
import { skillRequestJoin } from './skills/match_request'
import { skillApproveFirstPending } from './skills/match_approve'

import { newSupabaseAnonClient, signIn } from './helpers/supabase'
import { getMyParticipantRow } from './helpers/assertDb'

function must(name: string) {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env: ${name}`)
  return v
}

function getUserCreds() {
  const email =
    process.env.TEST_P1_EMAIL ||
    process.env.TEST_USER_EMAIL ||
    process.env.TEST_USER_USER_ID
  const pass =
    process.env.TEST_P1_PASSWORD ||
    process.env.TEST_USER_PASSWORD ||
    process.env.TEST_P1_PASS ||
    process.env.TEST_USER_PASS

  if (!email) throw new Error('Missing env for user email (TEST_P1_EMAIL or TEST_USER_EMAIL)')
  if (!pass) throw new Error('Missing env for user password (TEST_P1_PASSWORD or TEST_USER_PASSWORD)')
  return { email, pass }
}

test('Phase C — request -> org approve -> confirmed (DB truth)', async ({ browser }) => {
  test.setTimeout(120_000)

  const baseUrl = must('PHASEC_BASE_URL')
  const orgEmail = must('TEST_ORG_EMAIL')
  const orgPass = must('TEST_ORG_PASSWORD')
  const { email: userEmail, pass: userPass } = getUserCreds()

  const orgCtx = await browser.newContext({ baseURL: baseUrl })
  const userCtx = await browser.newContext({ baseURL: baseUrl })

  const orgPage = await orgCtx.newPage()
  const userPage = await userCtx.newPage()

  // (A) ORG 登录并创建 match
  await skillLogin(orgPage, orgEmail, orgPass)
  const matchId = await skillCreateMatchAndGetId(orgPage)

  // (B) USER 登录并 request join
  await skillLogin(userPage, userEmail, userPass)
  await skillRequestJoin(userPage, matchId)

  // (C) DB 断言
  const userDb = newSupabaseAnonClient()
  await signIn(userDb, userEmail, userPass)

  const mp1 = await getMyParticipantRow(userDb, matchId)
  expect(mp1.status).toBe('pending')
  expect(mp1.user_accepted_at).not.toBeNull()
  expect(mp1.org_approved_at).toBeNull()

  // (D) ORG approve
  await skillApproveFirstPending(orgPage, matchId)

  // (E) DB 断言
  const mp2 = await getMyParticipantRow(userDb, matchId)
  expect(mp2.status).toBe('confirmed')
  expect(mp2.org_approved_at).not.toBeNull()

  await orgCtx.close()
  await userCtx.close()
})
