'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ContactPlayerResolved } from '@/lib/api/roster'
import { parseContactTextInput } from '@/lib/contact-text-import'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'

type EditableDraft = ContactImportDraft & {
  selected: boolean
}

type Props = {
  userId?: string | null
  existingContacts: ContactPlayerResolved[]
  onParseScreenshots?: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
  onImported: () => Promise<void> | void
  variant?: 'default' | 'mobile-main'
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
}

type LegacyImageSmartImportProps = Props & {
  userId: string
  onParseScreenshots: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
}

type PreviewFile = {
  name: string
  url: string
}

// Image Smart Import is intentionally disabled because the OpenAI path can incur API cost.
// The legacy UI is retained here for possible future gated, paid, or internal use.
const ENABLE_IMAGE_SMART_IMPORT = false

const SAMPLE_TEXT = [
  'Karen Hickerson 416-333-5916',
  'Mike Chen mike@gmail.com',
  'Linda +1 647 888 1234',
].join('\n')

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const SUPPORTED_IMAGE_EXTENSIONS = /\.(jpe?g|png|webp)$/i

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeEmail(value: string | null | undefined): string {
  return cleanText(value).toLowerCase()
}

function normalizePhone(value: string | null | undefined): string {
  const raw = cleanText(value)
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return ''
  if (digits.length === 11 && digits.startsWith('1')) return `1${digits.slice(1)}`
  return digits
}

function normalizeName(value: string | null | undefined): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizePathPart(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'contact-screenshot'
}

function isSupportedScreenshotFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type) || SUPPORTED_IMAGE_EXTENSIONS.test(file.name)
}

function buildMissingFields(draft: Pick<EditableDraft, 'display_name' | 'phone' | 'email'>): string[] {
  const missing: string[] = []
  if (!cleanText(draft.display_name)) missing.push('Name missing')
  if (!cleanText(draft.phone) && !cleanText(draft.email)) missing.push('Phone or email required')
  return missing
}

function getFriendlyImportError(error: unknown, fallback: string): string {
  const message =
    error && typeof error === 'object' && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : ''

  if (
    !message
    || message.includes('Server Components render')
    || message.includes('digest')
    || message === 'An error occurred'
  ) {
    return fallback
  }

  return message
}

function detectPossibleDuplicate(
  draft: Pick<EditableDraft, 'display_name' | 'phone' | 'email'>,
  existingContacts: ContactPlayerResolved[],
): EditableDraft['possible_duplicate'] {
  const draftEmail = normalizeEmail(draft.email)
  const draftPhone = normalizePhone(draft.phone)
  const draftName = normalizeName(draft.display_name)

  for (const contact of existingContacts) {
    const contactEmail = normalizeEmail(contact.email)
    const contactPhone = normalizePhone(contact.phone)
    const contactName = normalizeName(contact.display_name)

    if (draftEmail && contactEmail && draftEmail === contactEmail) {
      return {
        guest_id: contact.guest_id,
        display_name: contact.display_name,
        reason: 'Same email as an existing Contact Player',
      }
    }

    if (draftPhone && contactPhone && draftPhone === contactPhone) {
      return {
        guest_id: contact.guest_id,
        display_name: contact.display_name,
        reason: 'Same phone number as an existing Contact Player',
      }
    }

    if (draftName && contactName && draftName === contactName) {
      return {
        guest_id: contact.guest_id,
        display_name: contact.display_name,
        reason: 'Same name as an existing Contact Player',
      }
    }
  }

  return null
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6L9 17L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AlertIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
      <path d="M10.3 4.8L3.7 16.3C3 17.5 3.9 19 5.4 19H18.6C20.1 19 21 17.5 20.3 16.3L13.7 4.8C13 3.6 11 3.6 10.3 4.8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20H21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 3.5C17.3 2.7 18.7 2.7 19.5 3.5C20.3 4.3 20.3 5.7 19.5 6.5L8 18L4 19L5 15L16.5 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 7V5.5C9 4.7 9.7 4 10.5 4H13.5C14.3 4 15 4.7 15 5.5V7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18 7L17.3 18.1C17.2 19.2 16.3 20 15.2 20H8.8C7.7 20 6.8 19.2 6.7 18.1L6 7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}

export function ContactScreenshotImportSection(props: Props) {
  if (ENABLE_IMAGE_SMART_IMPORT && props.userId && props.onParseScreenshots) {
    return (
      <LegacyImageSmartImportSection
        {...props}
        userId={props.userId}
        onParseScreenshots={props.onParseScreenshots}
      />
    )
  }

  return <ContactTextImportSection {...props} />
}

function ContactTextImportSection({
  existingContacts,
  onImportScreenshotContacts,
  onImported,
  variant = 'default',
  secondaryActionLabel,
  onSecondaryAction,
}: Props) {
  const [textValue, setTextValue] = useState('')
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [retryMessage, setRetryMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)

  const selectedCount = useMemo(
    () => drafts.filter((draft) => draft.selected).length,
    [drafts],
  )

  const selectableDraftIds = useMemo(
    () => drafts.filter((draft) => draft.missing_fields.length === 0).map((draft) => draft.id),
    [drafts],
  )

  const step = drafts.length > 0 ? 'review' : retryMessage ? 'retry' : 'import'
  const allSelectableSelected = selectableDraftIds.length > 0 && drafts.every((draft) => draft.missing_fields.length > 0 || draft.selected)
  const isMobileMain = variant === 'mobile-main'

  const updateDraft = (id: string, updater: (draft: EditableDraft) => EditableDraft) => {
    setDrafts((previous) =>
      previous.map((draft) => {
        if (draft.id !== id) return draft
        const nextDraft = updater(draft)
        const missingFields = buildMissingFields(nextDraft)
        const possibleDuplicate = detectPossibleDuplicate(nextDraft, existingContacts)
        return {
          ...nextDraft,
          missing_fields: missingFields,
          possible_duplicate: possibleDuplicate,
          selected: missingFields.length === 0 ? nextDraft.selected : false,
        }
      }),
    )
  }

  const resetFlow = () => {
    setTextValue('')
    setDrafts([])
    setEditingDraftId(null)
    setRetryMessage(null)
  }

  const handleParseText = () => {
    const trimmed = textValue.trim()
    setDrafts([])
    setEditingDraftId(null)
    setNotice(null)

    if (!trimmed) {
      setRetryMessage('Paste at least one name, phone, or email to import.')
      return
    }

    const parsed = parseContactTextInput(trimmed, existingContacts)
    const nextDrafts = parsed.map((draft) => ({
      ...draft,
      selected: draft.selected_by_default,
    }))

    setDrafts(nextDrafts)
    setEditingDraftId(nextDrafts.find((draft) => draft.missing_fields.length > 0)?.id ?? null)

    if (nextDrafts.length > 0) {
      setRetryMessage(null)
      setNotice(`Found ${nextDrafts.length} contact candidate${nextDrafts.length === 1 ? '' : 's'}. Review and confirm before saving.`)
    } else {
      setRetryMessage("We couldn't find any names, phones, or emails. Try one player per line.")
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setRetryMessage(null)
    setNotice(null)

    try {
      const selectedDrafts = drafts.filter((draft) => draft.selected && draft.missing_fields.length === 0)
      if (selectedDrafts.length === 0) {
        setRetryMessage('Select at least one complete contact to save, or edit a row to add the missing name, phone, or email.')
        setImporting(false)
        return
      }

      const result = await onImportScreenshotContacts(
        selectedDrafts.map((draft) => ({
          display_name: cleanText(draft.display_name),
          phone: cleanText(draft.phone) || null,
          email: normalizeEmail(draft.email) || null,
          source_file_name: draft.source_file_name,
        })),
      )

      setNotice(
        result.skipped > 0
          ? `Saved ${result.created} Contact Player${result.created === 1 ? '' : 's'} and skipped ${result.skipped}.`
          : `Saved ${result.created} Contact Player${result.created === 1 ? '' : 's'}.`,
      )
      resetFlow()
      await onImported()
    } catch (err: unknown) {
      setRetryMessage(getFriendlyImportError(err, 'We could not save those contacts yet. Review the selected rows and try again.'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={isMobileMain ? 'bg-white' : 'bg-white px-1 pb-6'}>
      {step === 'review' ? (
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                Review imported contacts
              </span>
              <span className="text-sm text-slate-500">
                {drafts.length} contact candidate{drafts.length === 1 ? '' : 's'} found
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                resetFlow()
                setNotice(null)
              }}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Import more text
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={allSelectableSelected}
                  onChange={() => {
                    const nextSelected = !allSelectableSelected
                    setDrafts((previous) =>
                      previous.map((draft) => ({
                        ...draft,
                        selected: draft.missing_fields.length === 0 ? nextSelected : false,
                      })),
                    )
                  }}
                />
                <span>Select all</span>
              </label>
              <span>Actions</span>
            </div>

            {drafts.map((draft) => {
              const isEditing = editingDraftId === draft.id

              return (
                <div
                  key={draft.id}
                  className={[
                    'group rounded-[20px] border p-4 transition-all',
                    draft.selected
                      ? 'border-blue-200 bg-blue-50/30'
                      : 'border-slate-100 bg-white opacity-85 hover:opacity-100',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      disabled={draft.missing_fields.length > 0}
                      onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, selected: event.target.checked }))}
                      className="mt-1 h-5 w-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                    />

                    <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-bold text-slate-800">{draft.display_name || 'Untitled contact'}</p>
                          {draft.confidence === 'high' ? (
                            <span className="text-green-500" title="High confidence">
                              <CheckIcon />
                            </span>
                          ) : (
                            <span className="text-amber-500" title="Needs review">
                              <AlertIcon />
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">Name</p>
                      </div>

                      <div className="min-w-0">
                        <p className={`text-sm ${draft.phone ? 'text-slate-700' : 'italic text-slate-300'}`}>
                          {draft.phone || 'No phone detected'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">Phone</p>
                      </div>

                      <div className="min-w-0">
                        <p className={`truncate text-sm ${draft.email ? 'text-slate-700' : 'italic text-slate-300'}`}>
                          {draft.email || 'No email detected'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">Email</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditingDraftId((current) => current === draft.id ? null : draft.id)}
                        className="rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-blue-100 hover:bg-white hover:text-blue-600"
                        aria-label="Edit imported contact"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrafts((previous) => previous.filter((item) => item.id !== draft.id))
                          if (editingDraftId === draft.id) setEditingDraftId(null)
                        }}
                        className="rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-red-100 hover:bg-white hover:text-red-600"
                        aria-label="Remove imported contact"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
                      Pasted text
                    </span>
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold capitalize text-emerald-700">
                      {draft.confidence} confidence
                    </span>
                  </div>

                  {draft.missing_fields.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.missing_fields.map((field) => (
                        <span key={field} className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                          {field}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {draft.possible_duplicate ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
                      <strong>Possible duplicate found.</strong> {draft.possible_duplicate.reason}: {draft.possible_duplicate.display_name}.
                    </div>
                  ) : null}

                  {isEditing ? (
                    <div className="mt-4 grid gap-3 rounded-[18px] border border-slate-200 bg-white p-4 md:grid-cols-3">
                      <label className="text-sm text-slate-600 md:col-span-3">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Name</span>
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, display_name: event.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-blue-300"
                        />
                      </label>
                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Phone</span>
                        <input
                          type="tel"
                          value={draft.phone}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, phone: event.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-blue-300"
                        />
                      </label>
                      <label className="text-sm text-slate-600 md:col-span-2">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Email</span>
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, email: event.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-blue-300"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {isMobileMain ? (
            <div className="rounded-[16px] border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
              {selectedCount} contacts selected to save
            </div>
          ) : (
            <div className="grid gap-3 rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div className="text-sm font-semibold text-slate-500 sm:italic">
                {selectedCount} contacts selected to save
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex">
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                  onClick={() => {
                    resetFlow()
                    setNotice(null)
                  }}
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={importing || selectedCount === 0 || selectableDraftIds.length === 0}
                  onClick={handleImport}
                  className={[
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold shadow-sm transition-all',
                    selectedCount > 0 && selectableDraftIds.length > 0 && !importing
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'cursor-not-allowed bg-slate-200 text-slate-400',
                  ].join(' ')}
                >
                  <span>{importing ? 'Saving...' : `Save selected (${selectedCount})`}</span>
                  <span aria-hidden="true">{'>'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="sr-only">Paste contact text</span>
            <textarea
              value={textValue}
              onChange={(event) => {
                setTextValue(event.target.value)
                setRetryMessage(null)
                setNotice(null)
              }}
              placeholder={SAMPLE_TEXT}
              rows={7}
              className="w-full resize-none rounded-2xl border border-[#A8B7CC] bg-white px-4 py-3 text-sm leading-6 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#94A3B8] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={handleParseText}
              className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[#0d6efd] px-5 py-3 text-sm font-bold text-white shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition hover:bg-[#0b5ed7]"
            >
              Import from text
            </button>
            {secondaryActionLabel && onSecondaryAction ? (
              <button
                type="button"
                onClick={onSecondaryAction}
                className="min-h-11 rounded-2xl border border-[#D7E2F0] bg-white px-5 py-3 text-sm font-semibold text-[#0B1F44] transition hover:bg-[#F8FBFF]"
              >
                {secondaryActionLabel}
              </button>
            ) : null}
          </div>

          {step === 'retry' ? (
            <div className="rounded-[18px] border border-[#bfdbfe] bg-[#F8FBFF] p-4 text-sm leading-6 text-[#475569]">
              <p className="font-bold text-[#0B1F44]">No contacts saved yet.</p>
              <p className="mt-1">{retryMessage}</p>
            </div>
          ) : null}

          <div className="rounded-2xl border border-[#D7E2F0] bg-white px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.12em] text-[#64748B]">Preview</p>
            <p className="mt-1 text-sm font-semibold leading-5 text-[#94A3B8]">
              Parsed contacts will appear here before saving.
            </p>
          </div>
        </div>
      )}

      {notice ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {retryMessage && step === 'review' ? (
        <div className="mt-4 rounded-2xl border border-[#bfdbfe] bg-[#F8FBFF] px-5 py-3 text-sm text-[#475569]">
          {retryMessage}
        </div>
      ) : null}

      {isMobileMain && step === 'review' ? (
        <div className="sticky bottom-0 z-10 mt-4 space-y-3 border-t border-[#E2E8F0] bg-white/95 px-1 py-4 backdrop-blur">
          <button
            type="button"
            disabled={importing || selectedCount === 0 || selectableDraftIds.length === 0}
            onClick={handleImport}
            className={[
              'inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-5 py-3 text-body-main font-bold shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition',
              selectedCount > 0 && selectableDraftIds.length > 0 && !importing
                ? 'bg-[#0d6efd] text-white hover:bg-[#0b5ed7]'
                : 'cursor-not-allowed bg-[#CBD5E1] text-white',
            ].join(' ')}
          >
            {importing ? 'Saving...' : 'Import Contacts'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function LegacyImageSmartImportSection({
  userId,
  existingContacts,
  onParseScreenshots,
  onImportScreenshotContacts,
  onImported,
  variant = 'default',
  secondaryActionLabel,
  onSecondaryAction,
}: LegacyImageSmartImportProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<PreviewFile[]>([])
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [retryMessage, setRetryMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)
  const [cameraPanelOpen, setCameraPanelOpen] = useState(false)

  useEffect(() => {
    const nextPreviews = files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }))

    setPreviews(nextPreviews)
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [files])

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const clipboardFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => Boolean(file))

      if (clipboardFiles.length === 0) return

      const hasImage = clipboardFiles.some((file) => file.type.startsWith('image/') || SUPPORTED_IMAGE_EXTENSIONS.test(file.name))
      if (!hasImage) return

      event.preventDefault()
      handleFileSelection(clipboardFiles, 'pasted')
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  const selectedCount = useMemo(
    () => drafts.filter((draft) => draft.selected).length,
    [drafts],
  )

  const selectableDraftIds = useMemo(
    () => drafts.filter((draft) => draft.missing_fields.length === 0).map((draft) => draft.id),
    [drafts],
  )

  const step = drafts.length > 0 ? 'review' : retryMessage ? 'retry' : 'import'
  const allSelectableSelected = selectableDraftIds.length > 0 && drafts.every((draft) => draft.missing_fields.length > 0 || draft.selected)
  const isMobileMain = variant === 'mobile-main'

  const updateDraft = (id: string, updater: (draft: EditableDraft) => EditableDraft) => {
    setDrafts((previous) =>
      previous.map((draft) => {
        if (draft.id !== id) return draft
        const nextDraft = updater(draft)
        const missingFields = buildMissingFields(nextDraft)
        const possibleDuplicate = detectPossibleDuplicate(nextDraft, existingContacts)
        return {
          ...nextDraft,
          missing_fields: missingFields,
          possible_duplicate: possibleDuplicate,
          selected: missingFields.length === 0 ? nextDraft.selected : false,
        }
      }),
    )
  }

  const resetFlow = () => {
    setFiles([])
    setDrafts([])
    setEditingDraftId(null)
    setRetryMessage(null)
    setCameraPanelOpen(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelection = (nextFiles: File[], source: 'uploaded' | 'dropped' | 'pasted' = 'uploaded') => {
    const supportedFiles = nextFiles.filter(isSupportedScreenshotFile)
    setDrafts([])
    setEditingDraftId(null)
    setNotice(null)
    setCameraPanelOpen(false)

    const rejectedCount = nextFiles.length - supportedFiles.length
    setRetryMessage(rejectedCount > 0 ? 'That file type is not supported yet. Try a JPG, PNG, or WEBP screenshot, or add the contact manually.' : null)
    setFiles(supportedFiles)

    if (supportedFiles.length > 0) {
      const sourceLabel = source === 'pasted' ? 'Pasted' : source === 'dropped' ? 'Dropped' : 'Selected'
      setNotice(`${sourceLabel} ${supportedFiles.length} image${supportedFiles.length === 1 ? '' : 's'}. Review, then run Smart Import.`)
    }

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handlePasteFromClipboard = async () => {
    if (parsing) return

    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      setRetryMessage('This browser cannot open clipboard images from a button yet. Copy a screenshot, then press Ctrl + V here, or use Upload image.')
      return
    }

    try {
      const clipboardItems = await navigator.clipboard.read()
      const pastedFiles: File[] = []

      for (const [index, item] of clipboardItems.entries()) {
        const imageType = item.types.find((type) => SUPPORTED_IMAGE_TYPES.has(type))
        if (!imageType) continue
        const blob = await item.getType(imageType)
        const extension = imageType === 'image/png' ? 'png' : imageType === 'image/webp' ? 'webp' : 'jpg'
        pastedFiles.push(new File([blob], `pasted-contact-${index + 1}.${extension}`, { type: imageType }))
      }

      if (pastedFiles.length === 0) {
        setRetryMessage('No JPG, PNG, or WEBP image was found in the clipboard. Copy a screenshot first, then try Paste image again.')
        return
      }

      handleFileSelection(pastedFiles, 'pasted')
    } catch {
      setRetryMessage('Clipboard permission was not granted. You can still press Ctrl + V here, or use Upload image.')
    }
  }

  const handleParseUploads = async () => {
    if (files.length === 0 || parsing) return

    setParsing(true)
    setNotice(null)
    setRetryMessage(null)

    const supabase = createSupabaseBrowserClient()
    const uploaded: ContactScreenshotUpload[] = []

    try {
      for (const [index, file] of files.entries()) {
        const path = `${userId}/${Date.now()}-${index}-${sanitizePathPart(file.name)}`
        const { error: uploadError } = await supabase.storage
          .from('contact-imports')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || 'image/png',
          })

        if (uploadError) throw new Error('Could not upload that screenshot yet. Try another image, or add the contact manually.')

        uploaded.push({
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || 'image/png',
        })
      }

      const parsed = await onParseScreenshots(uploaded)
      const nextDrafts = parsed.map((draft) => ({
        ...draft,
        selected: draft.selected_by_default,
      }))

      setDrafts(nextDrafts)
      setEditingDraftId(nextDrafts.find((draft) => draft.missing_fields.length > 0)?.id ?? null)

      if (nextDrafts.length > 0) {
        setRetryMessage(null)
        setNotice(`Found ${nextDrafts.length} contact candidate${nextDrafts.length === 1 ? '' : 's'}. Review and confirm before saving.`)
      } else {
        setRetryMessage('Smart Import could not read that image right now. Try another screenshot, or add the contact manually.')
      }
    } catch (error: unknown) {
      setDrafts([])
      setRetryMessage(getFriendlyImportError(error, 'Smart Import could not read that image right now. Try another screenshot, or add the contact manually.'))
    } finally {
      setParsing(false)
      if (uploaded.length > 0) {
        await supabase.storage.from('contact-imports').remove(uploaded.map((item) => item.storage_path))
      }
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setRetryMessage(null)
    setNotice(null)

    try {
      const selectedDrafts = drafts.filter((draft) => draft.selected && draft.missing_fields.length === 0)
      if (selectedDrafts.length === 0) {
        setRetryMessage('Select at least one complete contact to save, or edit a row to add the missing name, phone, or email.')
        setImporting(false)
        return
      }

      const result = await onImportScreenshotContacts(
        selectedDrafts.map((draft) => ({
          display_name: cleanText(draft.display_name),
          phone: cleanText(draft.phone) || null,
          email: normalizeEmail(draft.email) || null,
          source_file_name: draft.source_file_name,
        })),
      )

      setNotice(
        result.skipped > 0
          ? `Saved ${result.created} Contact Player${result.created === 1 ? '' : 's'} and skipped ${result.skipped}.`
          : `Saved ${result.created} Contact Player${result.created === 1 ? '' : 's'}.`,
      )
      resetFlow()
      await onImported()
    } catch (error: unknown) {
      setRetryMessage(getFriendlyImportError(error, 'We could not save those contacts yet. Review the selected rows and try again.'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className={isMobileMain ? 'bg-white' : 'bg-white px-1 pb-6'}>
      {step === 'review' ? (
        <div className="space-y-6 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                Review imported contacts
              </span>
              <span className="text-sm text-slate-500">
                {drafts.length} contact candidate{drafts.length === 1 ? '' : 's'} found
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                resetFlow()
                setNotice(null)
              }}
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Import another image
            </button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={allSelectableSelected}
                  onChange={() => {
                    const nextSelected = !allSelectableSelected
                    setDrafts((previous) =>
                      previous.map((draft) => ({
                        ...draft,
                        selected: draft.missing_fields.length === 0 ? nextSelected : false,
                      })),
                    )
                  }}
                />
                <span>Select all</span>
              </label>
              <span>Actions</span>
            </div>

            {drafts.map((draft) => {
              const isEditing = editingDraftId === draft.id

              return (
                <div
                  key={draft.id}
                  className={[
                    'group rounded-[20px] border p-4 transition-all',
                    draft.selected
                      ? 'border-blue-200 bg-blue-50/30'
                      : 'border-slate-100 bg-white opacity-85 hover:opacity-100',
                  ].join(' ')}
                >
                  <div className="flex items-start gap-4">
                    <input
                      type="checkbox"
                      checked={draft.selected}
                      disabled={draft.missing_fields.length > 0}
                      onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, selected: event.target.checked }))}
                      className="mt-1 h-5 w-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500"
                    />

                    <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-bold text-slate-800">{draft.display_name || 'Untitled contact'}</p>
                          {draft.confidence === 'high' ? (
                            <span className="text-green-500" title="High confidence">
                              <CheckIcon />
                            </span>
                          ) : (
                            <span className="text-amber-500" title="Needs review">
                              <AlertIcon />
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-slate-400">Name</p>
                      </div>

                      <div className="min-w-0">
                        <p className={`text-sm ${draft.phone ? 'text-slate-700' : 'italic text-slate-300'}`}>
                          {draft.phone || 'No phone detected'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">Phone</p>
                      </div>

                      <div className="min-w-0">
                        <p className={`truncate text-sm ${draft.email ? 'text-slate-700' : 'italic text-slate-300'}`}>
                          {draft.email || 'No email detected'}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">Email</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => setEditingDraftId((current) => current === draft.id ? null : draft.id)}
                        className="rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-blue-100 hover:bg-white hover:text-blue-600"
                        aria-label="Edit imported contact"
                      >
                        <EditIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDrafts((previous) => previous.filter((item) => item.id !== draft.id))
                          if (editingDraftId === draft.id) setEditingDraftId(null)
                        }}
                        className="rounded-lg border border-transparent p-2 text-slate-400 transition-all hover:border-red-100 hover:bg-white hover:text-red-600"
                        aria-label="Remove imported contact"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
                      {draft.source_file_name ? `Image: ${draft.source_file_name}` : 'Image import'}
                    </span>
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold capitalize text-emerald-700">
                      {draft.confidence} confidence
                    </span>
                  </div>

                  {draft.missing_fields.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.missing_fields.map((field) => (
                        <span key={field} className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                          {field}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {draft.possible_duplicate ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] leading-5 text-amber-800">
                      <strong>Possible duplicate found.</strong> {draft.possible_duplicate.reason}: {draft.possible_duplicate.display_name}.
                    </div>
                  ) : null}

                  {isEditing ? (
                    <div className="mt-4 grid gap-3 rounded-[18px] border border-slate-200 bg-white p-4 md:grid-cols-3">
                      <label className="text-sm text-slate-600 md:col-span-3">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Name</span>
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, display_name: event.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-blue-300"
                        />
                      </label>
                      <label className="text-sm text-slate-600">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Phone</span>
                        <input
                          type="tel"
                          value={draft.phone}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, phone: event.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-blue-300"
                        />
                      </label>
                      <label className="text-sm text-slate-600 md:col-span-2">
                        <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Email</span>
                        <input
                          type="email"
                          value={draft.email}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, email: event.target.value }))}
                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-700 outline-none transition focus:border-blue-300"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          {isMobileMain ? (
            <div className="rounded-[16px] border border-slate-100 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500">
              {selectedCount} contacts selected to save
            </div>
          ) : (
            <div className="grid gap-3 rounded-[20px] border border-slate-100 bg-slate-50 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <div className="text-sm font-semibold text-slate-500 sm:italic">
                {selectedCount} contacts selected to save
              </div>
              <div className="grid grid-cols-2 gap-3 sm:flex">
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
                  onClick={() => {
                    resetFlow()
                    setNotice(null)
                  }}
                  disabled={importing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={importing || selectedCount === 0 || selectableDraftIds.length === 0}
                  onClick={handleImport}
                  className={[
                    'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold shadow-sm transition-all',
                    selectedCount > 0 && selectableDraftIds.length > 0 && !importing
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'cursor-not-allowed bg-slate-200 text-slate-400',
                  ].join(' ')}
                >
                  <span>{importing ? 'Saving...' : `Save selected (${selectedCount})`}</span>
                  <span aria-hidden="true">{'>'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div
          className="space-y-4"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            handleFileSelection(Array.from(event.dataTransfer.files ?? []), 'dropped')
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => handleFileSelection(Array.from(event.target.files ?? []), 'uploaded')}
            className="hidden"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <button
              type="button"
              onClick={handlePasteFromClipboard}
              disabled={parsing}
              aria-label="Paste image from copied screenshot"
              className="min-h-20 rounded-2xl border border-[#DCE6F2] bg-white px-4 py-3 text-left text-[#475569] transition hover:bg-[#F8FBFF] disabled:cursor-wait disabled:text-[#94A3B8]"
            >
              <span className="block font-black text-[#0B1F44]">Paste image</span>
              <span className="mt-0.5 block text-[11px] font-semibold text-[#64748B]">After copying screenshot</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={parsing}
              aria-label="Upload image, JPG PNG or WEBP"
              className="min-h-20 rounded-2xl border border-[#bfdbfe] bg-white px-4 py-3 text-left text-[#0d6efd] transition hover:bg-[#eff6ff] disabled:cursor-wait disabled:text-[#94A3B8]"
            >
              <span className="block font-black">Upload image</span>
              <span className="mt-0.5 block text-[11px] font-semibold text-[#64748B]">JPG, PNG, WEBP</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCameraPanelOpen(true)
                setRetryMessage(null)
              }}
              disabled={parsing}
              aria-expanded={cameraPanelOpen}
              aria-controls="smart-import-camera-placeholder"
              aria-label="Start Camera Scan"
              className="hidden min-h-20 rounded-2xl border border-[#DCE6F2] bg-white px-4 py-3 text-left text-[#0B1F44] transition hover:bg-[#F8FBFF] disabled:cursor-wait disabled:text-[#94A3B8] sm:block"
            >
              <span className="block font-black">Scan with Camera</span>
              <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-[#64748B]">
                Use your computer camera to scan contact info from your phone screen.
              </span>
              <span className="mt-2 block text-[11px] font-black text-[#0d6efd]">Start Camera Scan</span>
            </button>
          </div>

          {cameraPanelOpen ? (
            <div
              id="smart-import-camera-placeholder"
              className="hidden rounded-[18px] border border-[#bfdbfe] bg-white px-4 py-4 text-sm leading-6 text-[#475569] sm:block"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-black text-[#0B1F44]">Scan with Camera</p>
                  <p className="mt-1">Use your computer camera to scan contact info from your phone screen.</p>
                  <div className="mt-3 space-y-1 font-semibold">
                    <p>Open a contact on your phone and hold it in front of your computer camera.</p>
                    <p>When camera scanning is available, PlayerHoods will try to read the name, phone, and email.</p>
                    <p>Review the details before saving.</p>
                  </div>
                  <p className="mt-3 text-xs font-semibold text-[#64748B]">
                    Camera capture is not active yet, so this preview does not request camera access or save contacts.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCameraPanelOpen(false)}
                  className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-[#D7E2F0] bg-white px-4 py-2 text-sm font-semibold text-[#0B1F44] transition hover:bg-[#F8FBFF]"
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}

          {previews.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[#D7E2F0] bg-white">
              <div className="flex gap-3 overflow-x-auto p-3">
                {previews.map((preview) => (
                  <div key={`${preview.name}-${preview.url}`} className="w-28 shrink-0">
                    <img src={preview.url} alt="" className="h-28 w-28 rounded-xl object-cover" />
                    <p className="mt-2 truncate text-[11px] font-semibold text-[#475569]" title={preview.name}>
                      {preview.name}
                    </p>
                  </div>
                ))}
              </div>
              <div className="border-t border-[#E2E8F0] px-4 py-3">
                <button
                  type="button"
                  disabled={parsing || files.length === 0}
                  onClick={handleParseUploads}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#0B1F44] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#16325F] disabled:cursor-wait disabled:bg-[#94A3B8]"
                >
                  {parsing ? 'Reading image...' : 'Run Smart Import'}
                </button>
              </div>
            </div>
          ) : null}

          {step === 'retry' ? (
            <div className="rounded-[18px] border border-[#bfdbfe] bg-[#F8FBFF] p-4 text-sm leading-6 text-[#475569]">
              <p className="font-bold text-[#0B1F44]">No contacts saved yet.</p>
              <p className="mt-1">{retryMessage}</p>
            </div>
          ) : null}

          {secondaryActionLabel && onSecondaryAction ? (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="min-h-11 rounded-2xl border border-[#D7E2F0] bg-white px-5 py-3 text-sm font-semibold text-[#0B1F44] transition hover:bg-[#F8FBFF]"
            >
              {secondaryActionLabel}
            </button>
          ) : null}
        </div>
      )}

      {notice ? (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {retryMessage && step === 'review' ? (
        <div className="mt-4 rounded-2xl border border-[#bfdbfe] bg-[#F8FBFF] px-5 py-3 text-sm text-[#475569]">
          {retryMessage}
        </div>
      ) : null}

      {isMobileMain && step === 'review' ? (
        <div className="sticky bottom-0 z-10 mt-4 space-y-3 border-t border-[#E2E8F0] bg-white/95 px-1 py-4 backdrop-blur">
          <button
            type="button"
            disabled={importing || selectedCount === 0 || selectableDraftIds.length === 0}
            onClick={handleImport}
            className={[
              'inline-flex min-h-12 w-full items-center justify-center rounded-2xl px-5 py-3 text-body-main font-bold shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition',
              selectedCount > 0 && selectableDraftIds.length > 0 && !importing
                ? 'bg-[#0d6efd] text-white hover:bg-[#0b5ed7]'
                : 'cursor-not-allowed bg-[#CBD5E1] text-white',
            ].join(' ')}
          >
            {importing ? 'Saving...' : 'Import Contacts'}
          </button>
        </div>
      ) : null}
    </div>
  )
}
