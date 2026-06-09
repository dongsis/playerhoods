import type { ContactPlayerResolved } from '@/lib/api/roster'
import type { ContactImportDraft, ContactImportDuplicate } from '@/lib/contact-screenshot-import'

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
const PHONE_PATTERN = /(?:\+?1[\s.-]*)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.-]*\d{3}[\s.-]*\d{4}\b/g

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeEmail(value: string | null | undefined): string {
  return cleanText(value).toLowerCase()
}

function normalizePhone(value: string | null | undefined): string {
  const raw = cleanText(value)
  if (!raw) return ''
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('1')) return `1${digits.slice(1)}`
  return hasPlus ? `+${digits}` : digits
}

function normalizeName(value: string | null | undefined): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizeName(value: string): string {
  return cleanText(value)
    .replace(/^[,;:\-\s|]+/, '')
    .replace(/[,;:\-\s|]+$/, '')
}

function sanitizePhone(value: string): string {
  return cleanText(value).replace(/\s+/g, ' ')
}

function buildMissingFields(draft: Pick<ContactImportDraft, 'display_name' | 'phone' | 'email'>): string[] {
  const missing: string[] = []
  if (!cleanText(draft.display_name)) missing.push('Name missing')
  if (!cleanText(draft.phone) && !cleanText(draft.email)) missing.push('Phone or email required')
  return missing
}

function compareDuplicate(
  draft: Pick<ContactImportDraft, 'display_name' | 'phone' | 'email'>,
  existing: ContactPlayerResolved,
): ContactImportDuplicate | null {
  const draftEmail = normalizeEmail(draft.email)
  const draftPhone = normalizePhone(draft.phone)
  const draftName = normalizeName(draft.display_name)

  const existingEmail = normalizeEmail(existing.email)
  const existingPhone = normalizePhone(existing.phone)
  const existingName = normalizeName(existing.display_name)

  if (draftEmail && existingEmail && draftEmail === existingEmail) {
    return {
      guest_id: existing.guest_id,
      display_name: existing.display_name,
      reason: 'Same email as an existing Contact Player',
    }
  }

  if (draftPhone && existingPhone && draftPhone === existingPhone) {
    return {
      guest_id: existing.guest_id,
      display_name: existing.display_name,
      reason: 'Same phone number as an existing Contact Player',
    }
  }

  if (draftName && existingName && draftName === existingName) {
    return {
      guest_id: existing.guest_id,
      display_name: existing.display_name,
      reason: 'Same name as an existing Contact Player',
    }
  }

  return null
}

function removeFirstMatch(value: string, match: string): string {
  const index = value.indexOf(match)
  if (index < 0) return value
  return `${value.slice(0, index)} ${value.slice(index + match.length)}`
}

function getFirstMatch(pattern: RegExp, value: string): string {
  pattern.lastIndex = 0
  const match = pattern.exec(value)
  pattern.lastIndex = 0
  return match?.[0] ?? ''
}

function makeDraftId(index: number): string {
  return `text-import-${index + 1}-${Math.random().toString(36).slice(2, 8)}`
}

function lineToDraft(
  line: string,
  index: number,
  existingContacts: ContactPlayerResolved[],
): ContactImportDraft | null {
  const rawEmail = getFirstMatch(EMAIL_PATTERN, line)
  const rawPhone = getFirstMatch(PHONE_PATTERN, line)
  const email = normalizeEmail(rawEmail)
  const phone = sanitizePhone(rawPhone)
  if (!email && !phone) return null

  let nameSource = line
  if (rawEmail) nameSource = removeFirstMatch(nameSource, rawEmail)
  if (rawPhone) nameSource = removeFirstMatch(nameSource, rawPhone)

  const displayName = sanitizeName(
    nameSource
      .replace(/\t/g, ' ')
      .replace(/[|,;]/g, ' ')
      .replace(/\s+/g, ' '),
  )

  const draft: ContactImportDraft = {
    id: makeDraftId(index),
    source_file_name: 'Pasted text',
    source_label: 'Imported from pasted text',
    display_name: displayName,
    phone,
    email,
    source_excerpt: '',
    confidence: displayName && (phone || email) ? 'high' : 'medium',
    missing_fields: [],
    possible_duplicate: null,
    selected_by_default: false,
  }

  draft.missing_fields = buildMissingFields(draft)
  draft.possible_duplicate = existingContacts
    .map((existing) => compareDuplicate(draft, existing))
    .find(Boolean) ?? null
  draft.selected_by_default = draft.missing_fields.length === 0

  return draft
}

export function parseContactTextInput(
  value: string,
  existingContacts: ContactPlayerResolved[],
): ContactImportDraft[] {
  return value
    .split(/\r?\n/)
    .map((line) => cleanText(line))
    .filter(Boolean)
    .map((line, index) => lineToDraft(line, index, existingContacts))
    .filter((draft): draft is ContactImportDraft => Boolean(draft))
}
