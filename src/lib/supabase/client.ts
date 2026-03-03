'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

// Return type assertion: @supabase/ssr@0.5.x generic params are behind @supabase/supabase-js@2.94.x
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    // Help diagnose onboarding button no-op scenarios
    console.error('Supabase env missing: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createBrowserClient<Database>(
    url as string,
    key as string
  ) as unknown as SupabaseClient<Database>
}

