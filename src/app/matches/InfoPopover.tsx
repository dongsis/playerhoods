'use client'

import { useEffect, useRef, useState } from 'react'

type InfoPopoverProps = {
  ariaLabel: string
  lines: string[]
  title?: string
}

export function InfoPopover({ ariaLabel, lines, title }: InfoPopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '999px',
          border: '1px solid #d1d5db',
          background: '#fff',
          color: '#6b7280',
          fontSize: '0.72rem',
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        ?
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.45rem)',
            left: 0,
            minWidth: '220px',
            maxWidth: '280px',
            padding: '0.7rem 0.8rem',
            borderRadius: '12px',
            border: '1px solid #d1d5db',
            background: '#fff',
            boxShadow: '0 12px 30px rgba(15, 23, 42, 0.14)',
            zIndex: 30,
          }}
        >
          {title && (
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', fontWeight: 600, color: '#111827' }}>
              {title}
            </p>
          )}
          {lines.map((line, index) => (
            <p
              key={`${line}-${index}`}
              style={{
                margin: index === lines.length - 1 ? 0 : '0 0 0.25rem',
                fontSize: '0.78rem',
                color: '#4b5563',
                lineHeight: 1.45,
              }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
