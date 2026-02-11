import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function newSupabaseAnonClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL!
  const anon = process.env.SUPABASE_ANON_KEY!
  if (!url || !anon) throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY')
  return createClient(url, anon, { auth: { persistSession: false } })
}

export async function signIn(client: SupabaseClient, email: string, password: string) {
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  if (!data.session) throw new Error('No session after sign-in')
  return data.session
}
