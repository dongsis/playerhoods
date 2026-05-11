'use client'

import { useMemo, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import type { ContactPlayerResolved } from '@/lib/api/roster'

type EditableDraft = ContactImportDraft & {
  selected: boolean
}

type Props = {
  userId: string
  existingContacts: ContactPlayerResolved[]
  onParseScreenshots: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
  onImported: () => Promise<void> | void
}

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

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-')
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 16V5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.5 8.5L12 5L15.5 8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 18.5H19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 7.5H8L9.5 5.5H14.5L16 7.5H19.5C20.3 7.5 21 8.2 21 9V18.5C21 19.3 20.3 20 19.5 20H4.5C3.7 20 3 19.3 3 18.5V9C3 8.2 3.7 7.5 4.5 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
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

function InfoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 10V16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="7.5" r="1" fill="currentColor" />
    </svg>
  )
}

export function ContactScreenshotImportSection({
  userId,
  existingContacts,
  onParseScreenshots,
  onImportScreenshotContacts,
  onImported,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null)

  const selectedCount = useMemo(
    () => drafts.filter((draft) => draft.selected).length,
    [drafts],
  )

  const selectableDraftIds = useMemo(
    () => drafts.filter((draft) => draft.missing_fields.length === 0).map((draft) => draft.id),
    [drafts],
  )

  const step = drafts.length > 0 ? 'review' : 'upload'
  const allSelectableSelected = selectableDraftIds.length > 0 && drafts.every((draft) => draft.missing_fields.length > 0 || draft.selected)

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
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleFileSelection = (nextFiles: File[]) => {
    setFiles(nextFiles)
    setDrafts([])
    setEditingDraftId(null)
    setError(null)
    setNotice(null)
  }

  const handleParse = async () => {
    if (files.length === 0) {
      setError('Choose at least one screenshot to parse.')
      return
    }

    setParsing(true)
    setError(null)
    setNotice(null)
    const supabase = createSupabaseBrowserClient()
    const uploaded: ContactScreenshotUpload[] = []

    try {
      for (const [index, file] of files.entries()) {
        const path = `${userId}/${Date.now()}-${index}-${sanitizePathPart(file.name)}`
        const { error: uploadError } = await supabase.storage
          .from('contact-imports')
          .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })

        if (uploadError) throw uploadError

        uploaded.push({
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || 'image/jpeg',
        })
      }

      const parsed = await onParseScreenshots(uploaded)
      const nextDrafts = parsed.map((draft) => ({
        ...draft,
        selected: draft.selected_by_default,
      }))
      setDrafts(nextDrafts)
      setEditingDraftId(nextDrafts.find((draft) => draft.missing_fields.length > 0)?.id ?? null)
      setNotice(
        nextDrafts.length > 0
          ? `Parsed ${nextDrafts.length} contact candidate${nextDrafts.length === 1 ? '' : 's'}. Review and confirm before importing.`
          : 'No contact candidates were found. Try a clearer screenshot or add contacts manually.',
      )
    } catch (err: unknown) {
      if (uploaded.length > 0) {
        await supabase.storage.from('contact-imports').remove(uploaded.map((item) => item.storage_path))
      }
      setError(getFriendlyImportError(err, 'Could not parse screenshot. Please try again or add the contact manually.'))
    } finally {
      setParsing(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setError(null)
    setNotice(null)

    try {
      const selectedDrafts = drafts.filter((draft) => draft.selected && draft.missing_fields.length === 0)
      if (selectedDrafts.length === 0) {
        setError('Select at least one valid contact to import.')
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
          ? `Imported ${result.created} contact${result.created === 1 ? '' : 's'} and skipped ${result.skipped}.`
          : `Imported ${result.created} contact${result.created === 1 ? '' : 's'}.`,
      )
      resetFlow()
      await onImported()
    } catch (err: unknown) {
      setError(getFriendlyImportError(err, 'Could not import contacts. Please review the selected contacts and try again.'))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_18px_40px_-36px_rgba(15,23,42,0.28)]">
      <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-6 py-4">
        <div>
          <h4 className="text-[1.1rem] font-semibold text-slate-800">Import from Screenshot</h4>
          <p className="mt-0.5 text-[12px] text-slate-500">Upload screenshots containing names, phones, or emails.</p>
        </div>
      </div>

      <div className="p-6">
        {step === 'upload' ? (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={(event) => handleFileSelection(Array.from(event.target.files ?? []))}
              className="hidden"
            />

            <div
              onDragOver={(event) => {
                event.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setIsDragging(false)
                handleFileSelection(Array.from(event.dataTransfer.files ?? []).filter((file) => file.type.startsWith('image/')))
              }}
              className={[
                'flex flex-wrap items-center justify-between gap-3 rounded-[18px] border px-4 py-4 transition',
                isDragging
                  ? 'border-blue-300 bg-blue-50'
                  : 'border-slate-200 bg-slate-50',
              ].join(' ')}
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
                  <UploadIcon />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800">
                    {files.length > 0 ? `${files.length} screenshot${files.length === 1 ? '' : 's'} selected` : 'Choose screenshot files'}
                  </div>
                  <div className="mt-1 truncate text-xs text-slate-500">
                    {files.length > 0
                      ? files.map((file) => file.name).join(', ')
                      : 'PNG, JPG, or WebP. You can also drop files here.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Choose Files
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-amber-100 bg-amber-50 p-4">
              <div className="flex gap-3 text-amber-800">
                <span className="mt-0.5 shrink-0 text-amber-500">
                  <InfoIcon />
                </span>
                <p className="text-xs leading-6">
                  Tip: For best results, ensure screenshots are clear and text is unobstructed. Multiple languages are supported.
                </p>
              </div>
              <button
                type="button"
                onClick={handleParse}
                disabled={parsing || files.length === 0}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {parsing ? 'Parsing...' : 'Parse Screenshot'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                  Success
                </span>
                <span className="text-sm text-slate-500">
                  {drafts.length} contact candidate{drafts.length === 1 ? '' : 's'} found
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetFlow()
                  setError(null)
                  setNotice(null)
                }}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                Upload again
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
                              <span className="text-amber-500" title="Medium confidence">
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
                          aria-label="Edit extracted contact"
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
                          aria-label="Remove extracted contact"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {draft.source_file_name ? (
                        <span className="rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-700">
                          {draft.source_file_name}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-semibold capitalize text-emerald-700">
                        {draft.confidence} confidence
                      </span>
                      {draft.source_excerpt ? (
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-500">
                          Parsed from: &ldquo;{draft.source_excerpt}&rdquo;
                        </span>
                      ) : null}
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
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-slate-100 bg-slate-50 px-6 py-4">
        <div className="text-sm italic text-slate-500">
          {step === 'review' ? `${selectedCount} contacts selected for import` : 'Supports batch processing of screenshots'}
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-lg px-5 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
            onClick={() => {
              resetFlow()
              setError(null)
              setNotice(null)
            }}
            disabled={parsing || importing}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={step !== 'review' || importing || selectedCount === 0 || selectableDraftIds.length === 0}
            onClick={handleImport}
            className={[
              'inline-flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold shadow-sm transition-all',
              step === 'review' && selectedCount > 0 && selectableDraftIds.length > 0 && !importing
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-200 text-slate-400',
            ].join(' ')}
          >
            <span>{step === 'review' ? (importing ? 'Importing...' : `Import Selected (${selectedCount})`) : 'Upload First'}</span>
            <span aria-hidden="true">›</span>
          </button>
        </div>
      </div>

      {notice ? (
        <div className="border-t border-emerald-100 bg-emerald-50 px-6 py-3 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="border-t border-rose-100 bg-rose-50 px-6 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
    </div>
  )
}
