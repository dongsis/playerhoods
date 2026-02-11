import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getGroups } from '@/lib/api/groups'

export default async function GroupsPage() {
  const supabase = await createSupabaseServerClient()
  const groups = await getGroups(supabase)

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>Groups</h1>
        <Link href="/groups/new">
          <button>New Group</button>
        </Link>
      </header>

      <nav style={{ marginBottom: '1rem' }}>
        <Link href="/dashboard">Dashboard</Link>
      </nav>

      {groups.length === 0 ? (
        <p>No groups yet. <Link href="/groups/new">Create your first group</Link></p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {groups.map((group) => (
            <li key={group.id} style={{ padding: '1rem', border: '1px solid #ccc', marginBottom: '0.5rem' }}>
              <Link href={`/groups/${group.id}`}>
                <strong>{group.name}</strong>
              </Link>
              {group.description && <p style={{ margin: '0.5rem 0 0' }}>{group.description}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
