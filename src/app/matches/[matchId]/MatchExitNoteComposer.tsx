'use client'

import { useRef, useState, type CSSProperties } from 'react'

type ExitNoteMode = 'decline' | 'withdraw'

type ChipOption = {
  id: string
  label: string
}

type Props = {
  mode: ExitNoteMode
  note: string
  onNoteChange: (value: string) => void
}

const REASON_OPTIONS: ChipOption[] = [
  { id: 'schedule_conflict', label: 'Schedule conflict' },
  { id: 'work_school', label: 'Work / school' },
  { id: 'family_commitment', label: 'Family commitment' },
  { id: 'not_feeling_well', label: 'Not feeling well' },
  { id: 'travel_away', label: 'Travel / away' },
  { id: 'transportation_issue', label: 'Transportation issue' },
  { id: 'weather_concern', label: 'Weather concern' },
  { id: 'personal_reason', label: 'Personal reason' },
]

const SUB_OPTIONS: ChipOption[] = [
  { id: 'find_sub', label: "I'll try to find a sub" },
  { id: 'cant_help_sub', label: "I can't help with a sub" },
]

const DECLINE_REASON_SENTENCES: Record<string, string> = {
  schedule_conflict: "Sorry, I can't make it because of a schedule conflict.",
  work_school: "Sorry, I can't make it because of work or school.",
  family_commitment: "Sorry, I can't make it because of a family commitment.",
  not_feeling_well: "Sorry, I'm not feeling well.",
  travel_away: "Sorry, I'm away.",
  transportation_issue: "Sorry, I can't make it because of a transportation issue.",
  weather_concern: "Sorry, I can't make it because of the weather.",
  personal_reason: "Sorry, I can't make it for personal reasons.",
}

const WITHDRAW_REASON_SENTENCES: Record<string, string> = {
  schedule_conflict: 'Sorry, I need to withdraw because of a schedule conflict.',
  work_school: 'Sorry, I need to withdraw because of work or school.',
  family_commitment: 'Sorry, I need to withdraw because of a family commitment.',
  not_feeling_well: "Sorry, I'm not feeling well, so I need to withdraw.",
  travel_away: "Sorry, I need to withdraw because I'm away.",
  transportation_issue: 'Sorry, I need to withdraw because of a transportation issue.',
  weather_concern: 'Sorry, I need to withdraw because of the weather.',
  personal_reason: 'Sorry, I need to withdraw for personal reasons.',
}

const SUB_SENTENCES: Record<string, string> = {
  find_sub: "I'll try to find a sub.",
  cant_help_sub: "I can't help with a sub.",
}

function buildGeneratedNote(mode: ExitNoteMode, reasonId: string | null, subId: string | null) {
  const reasonSentence = reasonId
    ? (mode === 'withdraw' ? WITHDRAW_REASON_SENTENCES[reasonId] : DECLINE_REASON_SENTENCES[reasonId])
    : null
  const subSentence = subId ? SUB_SENTENCES[subId] : null

  return [reasonSentence, subSentence].filter((value): value is string => Boolean(value)).join(' ').trim()
}

function mergeGeneratedNote(current: string, previousGenerated: string, nextGenerated: string) {
  const trimmedCurrent = current.trim()

  if (!trimmedCurrent) {
    return nextGenerated
  }

  if (previousGenerated && current.includes(previousGenerated)) {
    const replaced = current.replace(previousGenerated, nextGenerated)
    return replaced.replace(/\s{2,}/g, ' ').trim()
  }

  if (!previousGenerated) {
    if (!nextGenerated || current.includes(nextGenerated)) {
      return current
    }
    return `${nextGenerated} ${current}`.trim()
  }

  if (trimmedCurrent === previousGenerated.trim()) {
    return nextGenerated
  }

  if (!nextGenerated || current.includes(nextGenerated)) {
    return current
  }

  return `${nextGenerated} ${current}`.trim()
}

function selectChip(current: string | null, next: string) {
  return current === next ? null : next
}

export function MatchExitNoteComposer({ mode, note, onNoteChange }: Props) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [selectedSub, setSelectedSub] = useState<string | null>(null)
  const lastGeneratedRef = useRef('')

  const applyGeneratedNote = (nextReason: string | null, nextSub: string | null) => {
    const nextGenerated = buildGeneratedNote(mode, nextReason, nextSub)
    const merged = mergeGeneratedNote(note, lastGeneratedRef.current, nextGenerated)

    setSelectedReason(nextReason)
    setSelectedSub(nextSub)
    lastGeneratedRef.current = nextGenerated
    onNoteChange(merged)
  }

  return (
    <div style={composerWrapStyle}>
      <div style={chipSectionStyle}>
        <p style={sectionLabelStyle}>Reason</p>
        <div style={chipRowStyle}>
          {REASON_OPTIONS.map((option) => {
            const selected = selectedReason === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => applyGeneratedNote(selectChip(selectedReason, option.id), selectedSub)}
                style={selected ? selectedChipStyle : chipStyle}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <div style={chipSectionStyle}>
        <p style={sectionLabelStyle}>Sub</p>
        <div style={chipRowStyle}>
          {SUB_OPTIONS.map((option) => {
            const selected = selectedSub === option.id
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => applyGeneratedNote(selectedReason, selectChip(selectedSub, option.id))}
                style={selected ? selectedChipStyle : chipStyle}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Add a note (optional)"
        style={noteTextareaStyle}
      />
    </div>
  )
}

const composerWrapStyle: CSSProperties = {
  display: 'grid',
  gap: '0.8rem',
  marginTop: '0.85rem',
}

const chipSectionStyle: CSSProperties = {
  display: 'grid',
  gap: '0.35rem',
}

const sectionLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.62rem',
  fontWeight: 800,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#94a3b8',
}

const chipRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.45rem',
}

const chipStyle: CSSProperties = {
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#475569',
  borderRadius: '999px',
  padding: '0.42rem 0.75rem',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const selectedChipStyle: CSSProperties = {
  ...chipStyle,
  border: '1px solid #0d6efd',
  background: '#eff6ff',
  color: '#0d6efd',
}

const noteTextareaStyle: CSSProperties = {
  width: '100%',
  minHeight: '6rem',
  padding: '0.8rem 0.9rem',
  borderRadius: '14px',
  border: '1px solid #cbd5e1',
  color: '#0f172a',
  fontSize: '0.9rem',
  resize: 'vertical',
}
