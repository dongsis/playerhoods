'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'
import type { ContactImportDraft, ContactScreenshotImportResult, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import type { ContactPlayerResolved } from '@/lib/api/roster'

type EditableDraft = ContactImportDraft & {
  selected: boolean
}

type PreviewFile = {
  name: string
  url: string
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
  }>) => Promise<ContactScreenshotImportResult>
  onImported: (result: ContactScreenshotImportResult) => Promise<void> | void
  onDone?: () => void
}

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

function isSupportedScreenshotFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type) || (!file.type && SUPPORTED_IMAGE_EXTENSIONS.test(file.name))
}

function getFileExtensionForMimeType(mimeType: string): string {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function formatContactsAdded(count: number): string {
  return `${count} contact${count === 1 ? '' : 's'} added`
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

function ImportExampleCards() {
  return (
    <>
      <div className="rounded-2xl border border-[#DCE6F2] bg-[#F8FBFF] p-4 text-sm font-semibold leading-6 text-[#475569] sm:hidden">
        Works best with a clear crop of a chat group, email header, or contact list.
      </div>
      <div className="hidden grid-cols-3 gap-4 sm:grid">
        <div className="text-center">
          <div className="flex aspect-[3/4] flex-col gap-2 rounded-xl border border-[#DCE6F2] bg-[#F8FBFF] p-2 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.45)]">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] pb-1 text-left">
            <span className="h-3 w-3 rounded-full bg-[#2D6CDF]" />
            <span className="truncate text-[8px] font-black text-[#334155]">Tennis Group (12)</span>
          </div>
          {[
            ['RF', 'Roger Federer', 'bg-[#eff6ff] text-[#0d6efd]'],
            ['RN', 'Rafael Nadal', 'bg-[#EAFBF0] text-[#07823F]'],
            ['ND', 'Novak Djokovic', 'bg-[#FFF7D6] text-[#B7791F]'],
          ].map(([initials, name, tone]) => (
            <div key={name} className="flex items-center gap-2 text-left">
              <span className={['flex h-4 w-4 items-center justify-center rounded-full text-[6px] font-black', tone].join(' ')}>
                {initials}
              </span>
              <span className="truncate text-[8px] font-semibold text-[#334155]">{name}</span>
            </div>
          ))}
          <span className="mx-auto mt-auto h-0.5 w-7 rounded-full bg-[#CBD5E1]" />
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">Chat Group</p>
      </div>

      <div className="text-center">
        <div className="aspect-[3/4] rounded-xl border border-[#DCE6F2] bg-white p-2 shadow-[0_8px_18px_-16px_rgba(15,23,42,0.45)]">
          <div className="mb-2 border-b border-[#EEF2F7] pb-2 text-left">
            <div className="text-[7px] font-black text-[#2D6CDF]">To:</div>
            <div className="mt-1 h-1 w-12 rounded-full bg-[#E2E8F0]" />
          </div>
          <div className="flex flex-wrap gap-1">
            {['serena@gmail.com', 'venus@tennis.com', 'andy.m@uk.co'].map((email) => (
              <span key={email} className="rounded-full border border-[#bfdbfe] bg-[#eff6ff] px-1.5 py-0.5 text-[7px] font-semibold text-[#0d6efd]">
                {email}
              </span>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">Email Header</p>
      </div>

      <div className="text-center">
        <div className="aspect-[3/4] overflow-hidden rounded-xl border border-[#DCE6F2] bg-white shadow-[0_8px_18px_-16px_rgba(15,23,42,0.45)]">
          <div className="grid grid-cols-2 bg-[#F1F5F9] p-1 text-[7px] font-black text-[#64748B]">
            <span>Name</span>
            <span>Phone</span>
          </div>
          {[
            ['Stan Wawrinka', '555-0123'],
            ['Maria S.', '555-0198'],
            ['Carlos Alcaraz', '555-0442'],
            ['Coco Gauff', '555-0771'],
          ].map(([name, phone]) => (
            <div key={name} className="grid grid-cols-2 border-t border-[#EEF2F7] p-1.5 text-[7px]">
              <span className="truncate text-[#334155]">{name}</span>
              <span className="truncate text-[#94A3B8]">{phone}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-[#64748B]">Sheet/List</p>
      </div>
      </div>
    </>
  )
}

export function ContactScreenshotImportSection({
  userId,
  existingContacts,
  onParseScreenshots,
  onImportScreenshotContacts,
  onImported,
  onDone,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const importingRef = useRef(false)
  const [files, setFiles] = useState<File[]>([])
  const [previewFiles, setPreviewFiles] = useState<PreviewFile[]>([])
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [retryMessage, setRetryMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ContactScreenshotImportResult | null>(null)
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

  const step = importResult ? 'success' : parsing ? 'extracting' : drafts.length > 0 ? 'review' : retryMessage ? 'retry' : 'import'
  const allSelectableSelected = selectableDraftIds.length > 0 && drafts.every((draft) => draft.missing_fields.length > 0 || draft.selected)

  useEffect(() => {
    const nextPreviewFiles = files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }))

    setPreviewFiles(nextPreviewFiles)

    return () => {
      nextPreviewFiles.forEach((item) => URL.revokeObjectURL(item.url))
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
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDone = () => {
    if (onDone) {
      onDone()
      return
    }
    resetFlow()
    setNotice(null)
  }

  const handleAddAnotherScreenshot = () => {
    resetFlow()
    setNotice(null)
    window.setTimeout(() => fileInputRef.current?.click(), 0)
  }

  const handleFileSelection = (nextFiles: File[], source: 'uploaded' | 'dropped' | 'pasted' = 'uploaded') => {
    const supportedFiles = nextFiles.filter(isSupportedScreenshotFile)
    const rejectedCount = nextFiles.length - supportedFiles.length

    setFiles(supportedFiles)
    setDrafts([])
    setEditingDraftId(null)
    setImportResult(null)
    setRetryMessage(rejectedCount > 0 ? 'That file type is not supported yet. Try a JPG, PNG, or WEBP screenshot, or add the contact manually.' : null)
    setNotice(
      supportedFiles.length > 0
        ? `${supportedFiles.length} screenshot${supportedFiles.length === 1 ? '' : 's'} ${source}. Extracting contacts now.`
        : null,
    )
    if (fileInputRef.current) fileInputRef.current.value = ''

    if (supportedFiles.length > 0) {
      void handleParseFiles(supportedFiles)
    }
  }

  const handlePasteFromClipboard = async () => {
    if (parsing) return

    if (!navigator.clipboard || typeof navigator.clipboard.read !== 'function') {
      setRetryMessage('This browser cannot open clipboard images from a button yet. Copy a screenshot, then press Ctrl + V here, or use Upload screenshot.')
      return
    }

    try {
      const clipboardItems = await navigator.clipboard.read()
      const pastedFiles: File[] = []

      for (const [index, item] of clipboardItems.entries()) {
        const imageType = item.types.find((type) => SUPPORTED_IMAGE_TYPES.has(type))
        if (!imageType) continue

        const blob = await item.getType(imageType)
        const extension = getFileExtensionForMimeType(imageType)
        pastedFiles.push(new File([blob], `pasted-screenshot-${index + 1}.${extension}`, { type: imageType }))
      }

      if (pastedFiles.length === 0) {
        setRetryMessage('No JPG, PNG, or WEBP image was found in the clipboard. Copy a screenshot first, then try Paste screenshot again.')
        return
      }

      handleFileSelection(pastedFiles, 'pasted')
    } catch {
      setRetryMessage('Clipboard permission was not granted. You can still press Ctrl + V here, or use Upload screenshot.')
    }
  }

  const handleParseFiles = async (filesToParse = files) => {
    if (filesToParse.length === 0) {
      setRetryMessage('Choose a screenshot first. Smart Import works with JPG, PNG, and WEBP images.')
      return
    }

    setParsing(true)
    setRetryMessage(null)
    setNotice(null)
    const supabase = createSupabaseBrowserClient()
    const uploaded: ContactScreenshotUpload[] = []

    try {
      for (const [index, file] of filesToParse.entries()) {
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
      if (nextDrafts.length > 0) {
        setNotice(`Found ${nextDrafts.length} contact candidate${nextDrafts.length === 1 ? '' : 's'}. Review and confirm before saving.`)
      } else {
        setRetryMessage('We could not find contact details in that screenshot. Try a clearer crop, paste another screenshot, or add the contact manually.')
      }
    } catch (err: unknown) {
      if (uploaded.length > 0) {
        await supabase.storage.from('contact-imports').remove(uploaded.map((item) => item.storage_path))
      }
      setRetryMessage(getFriendlyImportError(err, 'We could not read that screenshot. Try a clearer crop, paste another screenshot, or add the contact manually.'))
    } finally {
      setParsing(false)
    }
  }

  const handleImport = async () => {
    if (importingRef.current) return
    importingRef.current = true
    setImporting(true)
    setRetryMessage(null)
    setNotice(null)
    setImportResult(null)

    try {
      const selectedDrafts = drafts.filter((draft) => draft.selected && draft.missing_fields.length === 0)
      if (selectedDrafts.length === 0) {
        setRetryMessage('Select at least one complete contact to save, or edit a row to add the missing name, phone, or email.')
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

      setImportResult(result)
      setEditingDraftId(null)
      await onImported(result)
    } catch (err: unknown) {
      setRetryMessage(getFriendlyImportError(err, 'We could not save those contacts yet. Review the selected rows and try again.'))
    } finally {
      importingRef.current = false
      setImporting(false)
    }
  }

  return (
    <div className="bg-white px-1 pb-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => handleFileSelection(Array.from(event.target.files ?? []), 'uploaded')}
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
          handleFileSelection(Array.from(event.dataTransfer.files ?? []), 'dropped')
        }}
        className={[
          'overflow-hidden rounded-[28px] border bg-white transition',
          isDragging ? 'border-[#2D6CDF] shadow-[0_20px_60px_-36px_rgba(45,108,223,0.8)]' : 'border-[#DCE6F2]',
        ].join(' ')}
      >
        {step === 'success' && importResult ? (
          <div className="space-y-5 p-5">
            <div className="rounded-[24px] border border-emerald-100 bg-emerald-50 px-5 py-6 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-sm">
                <CheckIcon className="h-6 w-6" />
              </span>
              <h4 className="mt-4 text-xl font-black text-[#0B1F44]">
                {formatContactsAdded(importResult.created)}
              </h4>
              {importResult.skipped > 0 ? (
                <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-emerald-800">
                  {importResult.skipped} incomplete contact{importResult.skipped === 1 ? '' : 's'} skipped.
                </p>
              ) : null}
              <p className="mx-auto mt-2 max-w-md text-sm font-semibold leading-6 text-emerald-700">
                Saved Contact Players are ready in the parent list. Nothing was sent or invited automatically.
              </p>
            </div>
            <div className="grid gap-3 sm:flex sm:justify-end">
              <button
                type="button"
                onClick={handleAddAnotherScreenshot}
                className="min-h-11 rounded-lg border border-[#bfdbfe] bg-white px-5 py-2 text-sm font-semibold text-[#0d6efd] transition hover:bg-[#eff6ff]"
              >
                Add another screenshot
              </button>
              <button
                type="button"
                onClick={handleDone}
                className="min-h-11 rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : null}

        {step === 'review' ? (
          <div className="space-y-6 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">
                  Review extracted contacts
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
                Import another screenshot
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
                  disabled={parsing || importing}
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
          </div>
        ) : null}

        {step !== 'review' && step !== 'success' ? (
          <div className="space-y-5 p-5">
            <div className="grid gap-5 md:grid-cols-[1.05fr_0.95fr] md:items-center">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-sm font-bold text-[#334155] md:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={parsing}
                    className="min-h-12 rounded-2xl border border-[#bfdbfe] bg-white px-4 py-3 text-[#0d6efd] transition hover:bg-[#eff6ff] disabled:cursor-wait disabled:text-[#94A3B8]"
                  >
                    Upload screenshot
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteFromClipboard}
                    disabled={parsing}
                    className="min-h-12 rounded-2xl border border-[#DCE6F2] bg-white px-4 py-3 text-[#475569] transition hover:bg-[#F8FBFF] disabled:cursor-wait disabled:text-[#94A3B8]"
                  >
                    Paste screenshot
                  </button>
                  <span className="hidden min-h-12 items-center justify-center rounded-2xl border border-[#DCE6F2] bg-white px-4 py-3 text-center text-[#475569] md:flex">
                    Drag image here
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing}
                  className={[
                  'block w-full rounded-[24px] border-2 border-dashed px-5 py-7 text-center transition disabled:cursor-wait',
                  isDragging ? 'border-[#2D6CDF] bg-[#eff6ff]' : 'border-[#DCE6F2] bg-[#F8FBFF]',
                ].join(' ')}
                >
                  <span className="mx-auto flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-[#2D6CDF] shadow-sm">
                    <UploadIcon />
                  </span>
                  <div className="mt-4 text-base font-black text-[#1E293B]">
                    {step === 'extracting'
                      ? 'Extracting contacts...'
                      : step === 'retry'
                        ? 'Try another screenshot'
                        : 'Import contacts'}
                  </div>
                  <p className="mx-auto mt-2 max-w-md text-xs font-semibold leading-5 text-[#64748B]">
                    {step === 'extracting'
                      ? 'Looking for names, emails, and phone numbers. Nothing is saved or invited automatically.'
                      : step === 'retry'
                        ? 'A tighter crop around the email header, chat list, or contact table usually works best.'
                        : 'Upload, paste, or drop a screenshot. We will extract contacts automatically, then you choose what to save.'}
                  </p>
                  {files.length > 0 ? (
                    <p className="mt-3 truncate text-xs font-semibold text-[#94A3B8]">
                      {files.map((file) => file.name).join(', ')}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs font-semibold text-[#94A3B8]">JPG, PNG, WEBP</p>
                  )}
                </button>

                {step === 'retry' ? (
                  <div className="rounded-[20px] border border-[#bfdbfe] bg-[#F8FBFF] p-4 text-sm leading-6 text-[#475569]">
                    <p className="font-bold text-[#0B1F44]">No contacts saved yet.</p>
                    <p className="mt-1">{retryMessage}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-xl bg-[#0B1F44] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#16325F]"
                      >
                        Retry import
                      </button>
                      <span className="text-sm font-semibold text-[#64748B]">Or use Add My Contact manually.</span>
                    </div>
                  </div>
                ) : null}

                <details className="rounded-[18px] border border-[#E2E8F0] bg-white px-4 py-3 text-xs font-semibold leading-5 text-[#64748B]">
                  <summary className="cursor-pointer font-black text-[#334155]">Need help taking a screenshot?</summary>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <p><strong>Windows:</strong> Press Win + Shift + S, select the email header or contact list, then come back here and press Ctrl + V.</p>
                    <p><strong>Mac:</strong> Press Command + Shift + 4, select the area, then upload or paste the screenshot.</p>
                  </div>
                </details>
              </div>

              <div className="space-y-3">
                {previewFiles.length > 0 ? (
                  <div className="grid gap-3">
                    {previewFiles.map((file) => (
                      <figure key={`${file.name}-${file.url}`} className="overflow-hidden rounded-2xl border border-[#E2E8F0] bg-[#F8FBFF]">
                        <img src={file.url} alt={`Preview of ${file.name}`} className="h-48 w-full object-contain" />
                        <figcaption className="truncate border-t border-[#E2E8F0] bg-white px-3 py-2 text-xs font-semibold text-[#64748B]">
                          {file.name}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : (
                  <ImportExampleCards />
                )}
              </div>
            </div>
          </div>
        ) : null}

        {notice ? (
          <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        ) : null}
        {retryMessage && step === 'review' ? (
          <div className="border-t border-[#bfdbfe] bg-[#F8FBFF] px-5 py-3 text-sm text-[#475569]">
            {retryMessage}
          </div>
        ) : null}
      </div>
    </div>
  )
}
