'use client'

import { ReactNode, useState } from 'react'

type TabKey = 'info' | 'members' | 'resources'
type MobileSectionKey = TabKey | 'settings'

type Props = {
  info: ReactNode
  members: ReactNode
  resources: ReactNode
}

type MobileProps = Props & {
  settings?: ReactNode
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

export function GroupMobileMorePanel({ info, members, resources, settings }: MobileProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<MobileSectionKey>('info')
  const sections: { key: MobileSectionKey; label: string; content: ReactNode }[] = [
    { key: 'info', label: 'Group Info', content: info },
    { key: 'members', label: 'Members', content: members },
    { key: 'resources', label: 'Resources', content: resources },
  ]

  if (settings) {
    sections.push({ key: 'settings', label: 'Group Settings', content: settings })
  }

  const activeContent = sections.find((section) => section.key === activeSection)?.content ?? info

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Open group menu"
        style={{
          width: '2.35rem',
          height: '2.35rem',
          borderRadius: '999px',
          border: '1px solid #dbe4ee',
          background: '#ffffff',
          color: '#0f172a',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.05rem',
          fontWeight: 900,
          lineHeight: 1,
          cursor: 'pointer',
        }}
      >
        ...
      </button>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Group menu"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'rgba(15, 23, 42, 0.36)',
            display: 'grid',
            alignItems: 'end',
          }}
        >
          <button
            type="button"
            aria-label="Close group menu"
            onClick={() => setIsOpen(false)}
            style={{
              position: 'absolute',
              inset: 0,
              border: 0,
              background: 'transparent',
              cursor: 'default',
            }}
          />
          <section
            style={{
              position: 'relative',
              zIndex: 1,
              maxHeight: '88dvh',
              overflow: 'hidden',
              borderRadius: '24px 24px 0 0',
              background: '#ffffff',
              boxShadow: '0 -24px 60px rgba(15, 23, 42, 0.18)',
              display: 'grid',
              gridTemplateRows: 'auto auto minmax(0, 1fr)',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                padding: '1rem 1rem 0.75rem',
                borderBottom: '1px solid #eef2f7',
              }}
            >
              <h2 style={{ margin: 0, color: '#0f172a', fontSize: '1.05rem', fontWeight: 900 }}>
                {sections.find((section) => section.key === activeSection)?.label ?? 'Group Info'}
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close group menu"
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '999px',
                  border: '1px solid #dbe4ee',
                  background: '#fff',
                  color: '#475569',
                  fontSize: '1rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                x
              </button>
            </header>

            <nav
              aria-label="Group menu sections"
              style={{
                display: 'flex',
                gap: '0.45rem',
                overflowX: 'auto',
                padding: '0.7rem 1rem',
                borderBottom: '1px solid #eef2f7',
              }}
            >
              {sections.map((section) => {
                const isActive = activeSection === section.key
                return (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setActiveSection(section.key)}
                    style={{
                      flexShrink: 0,
                      borderRadius: '999px',
                      border: isActive ? '1px solid #0f172a' : '1px solid #dbe4ee',
                      background: isActive ? '#0f172a' : '#ffffff',
                      color: isActive ? '#ffffff' : '#334155',
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                    }}
                  >
                    {section.label}
                  </button>
                )
              })}
            </nav>

            <div
              style={{
                minHeight: 0,
                overflow: 'auto',
                padding: '1rem',
              }}
            >
              {activeContent}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
