'use client'

import type { ActivityItem } from '@/lib/api/matches'
import { formatRelativeTime, formatActionType } from '@/lib/utils/format-time'

interface Props {
  activities: ActivityItem[]
}

export function ActivityFeed({ activities }: Props) {
  if (activities.length === 0) {
    return <p style={{ color: '#999', fontSize: '0.85rem' }}>No activity yet.</p>
  }

  return (
    <div>
      {activities.map(a => (
        <div
          key={a.id}
          style={{
            display: 'flex',
            gap: '0.75rem',
            padding: '0.5rem 0',
            borderBottom: '1px solid #f0f0f0',
            alignItems: 'baseline',
          }}
        >
          <div style={{ flex: 1, fontSize: '0.85rem', lineHeight: 1.4 }}>
            <strong>{a.actor_name}</strong>{' '}
            <span style={{ color: '#555' }}>{formatActionType(a.action_type)}</span>{' '}
            <strong>{a.subject_name}</strong>
            {a.note && (
              <em style={{ color: '#888', marginLeft: '0.4rem' }}>
                &ldquo;{a.note}&rdquo;
              </em>
            )}
          </div>
          <time
            suppressHydrationWarning
            style={{ color: '#aaa', fontSize: '0.75rem', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {formatRelativeTime(a.created_at)}
          </time>
        </div>
      ))}
    </div>
  )
}
