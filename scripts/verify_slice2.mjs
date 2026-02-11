// scripts/verify_slice2.mjs

import { createClient } from '@supabase/supabase-js'

// 1. 从环境变量读配置（你本地一般已经有）
const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE env vars')
  process.exit(1)
}

// 2. 用 service role（不走 RLS，纯验证）
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// 3. 开始验证
async function run() {
  console.log('▶ Verifying Slice 2...')

  // A. matches 表是否存在 request admission
  const { data: matches, error: matchErr } = await supabase
    .from('matches')
    .select('id, admission_mode')
    .eq('admission_mode', 'request')
    .limit(1)

  if (matchErr || matches.length === 0) {
    throw new Error('❌ No request-admission match found')
  }

  const matchId = matches[0].id
  console.log('✓ Found request match:', matchId)

  // B. 是否存在 pending participant / guest
  const { data: participants, error: partErr } = await supabase
    .from('match_participants')
    .select('id, status, join_method')
    .eq('match_id', matchId)
    .eq('status', 'pending')

  if (partErr) {
    throw new Error('❌ Failed reading match_participants')
  }

  if (participants.length === 0) {
    throw new Error('❌ No pending participants / guests')
  }

  console.log('✓ Pending participants exist')

  // C. 是否有 confirmed guest_add
  const { data: confirmedGuests } = await supabase
    .from('match_participants')
    .select('id')
    .eq('match_id', matchId)
    .eq('join_method', 'guest_add')
    .eq('status', 'confirmed')

  if (!confirmedGuest) {
  console.warn('⚠ guest_add not confirmed (expected if organizer has not confirmed yet)');
} else {
  console.log('✔ Confirmed guest_add found');
}
}

run().catch(err => {
  console.error(err.message)
  process.exit(1)
})
