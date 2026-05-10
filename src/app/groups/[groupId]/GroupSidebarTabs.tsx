'use client'

import { ReactNode, useState } from 'react'

type TabKey = 'info' | 'members' | 'resources'

type Props = {
  info: ReactNode
  members: ReactNode
  resources: ReactNode
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'info', label: 'Group Info' },
  { key: 'members', label: 'Members' },
  { key: 'resources', label: 'Resources' },
]

export function GroupSidebarTabs({ info, members, resources }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('info')
  const panels: Record<TabKey, ReactNode> = {
    info,
    members,
    resources,
  }

  return (
    <div style={{ display: 'grid', gap: '0.95rem' }}>
      <div
        role="tablist"
        aria-label="Group sections"
        style={{
          display: 'grid',
          gap: '0.45rem',
        }}
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.key)}
              style={{
                width: '100%',
                borderRadius: '14px',
                border: isActive ? '1px solid #1e293b' : '1px solid #dbe4ee',
                background: isActive ? '#1e293b' : '#ffffff',
                color: isActive ? '#ffffff' : '#334155',
                padding: '0.78rem 0.95rem',
                fontSize: '0.88rem',
                fontWeight: 800,
                textAlign: 'left',
                cursor: 'pointer',
                boxShadow: isActive ? '0 10px 22px rgba(15, 23, 42, 0.14)' : 'none',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      <div>{panels[activeTab]}</div>
    </div>
  )
}
