import { redirect } from 'next/navigation'
import { getUser } from '@/lib/supabase/server'

export default async function HomePage() {
  const user = await getUser()

  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
