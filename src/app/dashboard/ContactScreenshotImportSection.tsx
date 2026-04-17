'use client'

import { useMemo, useState } from 'react'
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

export function ContactScreenshotImportSection({
  userId,
  existingContacts,
  onParseScreenshots,
  onImportScreenshotContacts,
  onImported,
}: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [drafts, setDrafts] = useState<EditableDraft[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)

  const selectedCount = useMemo(
    () => drafts.filter((draft) => draft.selected).length,
    [drafts],
  )

  const selectableDraftIds = useMemo(
    () => drafts.filter((draft) => draft.missing_fields.length === 0).map((draft) => draft.id),
    [drafts],
  )

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
          selected:
            missingFields.length === 0
              ? nextDraft.selected
              : false,
        }
      }),
    )
  }

  const resetFlow = () => {
    setFiles([])
    setDrafts([])
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
      setNotice(
        nextDrafts.length > 0
          ? `Parsed ${nextDrafts.length} contact candidate${nextDrafts.length === 1 ? '' : 's'}. Review and confirm before importing.`
          : 'No contact candidates were found. Try a clearer screenshot or add contacts manually.',
      )
    } catch (err: unknown) {
      if (uploaded.length > 0) {
        await supabase.storage.from('contact-imports').remove(uploaded.map((item) => item.storage_path))
      }
      setError((err as { message?: string })?.message ?? 'Could not parse screenshot.')
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
      setError((err as { message?: string })?.message ?? 'Could not import contacts.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div style={{ padding: '1rem', border: '1px solid #ddd', borderRadius: '6px', marginBottom: '1.5rem', background: '#fafafa' }}>
      <div style={{ display: 'grid', gap: '0.35rem', marginBottom: '0.85rem' }}>
        <strong style={{ fontSize: '0.95rem' }}>Import from Screenshot</strong>
        <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>
          Use a clear list with names and phone or email.
        </p>
      </div>

      <div style={{ marginBottom: drafts.length > 0 ? '1rem' : '0.75rem' }}>
        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '0.25rem', color: '#555' }}>
          Upload screenshot(s)
        </label>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          onChange={(event) => {
            setFiles(Array.from(event.target.files ?? []))
            setDrafts([])
            setError(null)
            setNotice(null)
          }}
        />
        {files.length > 0 && (
          <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {files.map((file) => (
              <span
                key={`${file.name}-${file.size}`}
                style={{
                  padding: '0.15rem 0.45rem',
                  fontSize: '0.74rem',
                  borderRadius: '999px',
                  background: '#eef2ff',
                  color: '#4338ca',
                }}
              >
                {file.name}
              </span>
            ))}
          </div>
        )}
        <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={handleParse} disabled={parsing || files.length === 0} style={{ padding: '0.45rem 0.9rem' }}>
            {parsing ? 'Parsing...' : 'Parse screenshot'}
          </button>
          {(files.length > 0 || drafts.length > 0) && (
            <button
              type="button"
              onClick={() => {
                resetFlow()
                setError(null)
                setNotice(null)
              }}
              disabled={parsing || importing}
              style={{ padding: '0.45rem 0.9rem' }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {notice && <p style={{ color: '#166534', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{notice}</p>}
      {error && <p style={{ color: '#dc2626', fontSize: '0.82rem', margin: '0 0 0.75rem' }}>{error}</p>}

      {drafts.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <strong style={{ fontSize: '0.9rem' }}>Review extracted contacts</strong>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setDrafts((previous) => previous.map((draft) => ({
                  ...draft,
                  selected: draft.missing_fields.length === 0,
                })))}
                style={{ fontSize: '0.78rem' }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setDrafts((previous) => previous.map((draft) => ({ ...draft, selected: false })))}
                style={{ fontSize: '0.78rem' }}
              >
                Deselect all
              </button>
              <span style={{ fontSize: '0.78rem', color: '#666' }}>{selectedCount} selected</span>
            </div>
          </div>

          <div style={{ display: 'grid', gap: '0.65rem' }}>
            {drafts.map((draft) => (
              <div key={draft.id} style={{ border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff', padding: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'start', gap: '0.75rem' }}>
                  <input
                    type="checkbox"
                    checked={draft.selected}
                    disabled={draft.missing_fields.length > 0}
                    onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, selected: event.target.checked }))}
                    style={{ marginTop: '0.25rem' }}
                  />
                  <div style={{ flex: 1, display: 'grid', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        <span style={{ fontSize: '0.74rem', color: '#4338ca', background: '#eef2ff', padding: '0.12rem 0.45rem', borderRadius: '999px' }}>
                          {draft.source_file_name}
                        </span>
                        <span style={{ fontSize: '0.74rem', color: '#0f766e', background: '#ecfeff', padding: '0.12rem 0.45rem', borderRadius: '999px' }}>
                          {draft.confidence} confidence
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setDrafts((previous) => previous.filter((item) => item.id !== draft.id))}
                        style={{ fontSize: '0.78rem', color: '#b91c1c' }}
                      >
                        Skip
                      </button>
                    </div>

                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.74rem', marginBottom: '0.15rem', color: '#666' }}>Name</label>
                        <input
                          type="text"
                          value={draft.display_name}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, display_name: event.target.value }))}
                          style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <label style={{ display: 'block', fontSize: '0.74rem', marginBottom: '0.15rem', color: '#666' }}>Phone</label>
                          <input
                            type="tel"
                            value={draft.phone}
                            onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, phone: event.target.value }))}
                            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: '220px' }}>
                          <label style={{ display: 'block', fontSize: '0.74rem', marginBottom: '0.15rem', color: '#666' }}>Email</label>
                          <input
                            type="email"
                            value={draft.email}
                            onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, email: event.target.value }))}
                            style={{ width: '100%', padding: '0.4rem', boxSizing: 'border-box' }}
                          />
                        </div>
                      </div>
                    </div>

                    {draft.missing_fields.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                        {draft.missing_fields.map((field) => (
                          <span key={field} style={{ fontSize: '0.74rem', color: '#b45309', background: '#fff7ed', padding: '0.12rem 0.45rem', borderRadius: '999px' }}>
                            {field}
                          </span>
                        ))}
                      </div>
                    )}

                    {draft.possible_duplicate && (
                      <div style={{ fontSize: '0.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.45rem 0.55rem' }}>
                        <strong>Possible duplicate found.</strong> {draft.possible_duplicate.reason}: {draft.possible_duplicate.display_name}. You can keep this selected to import anyway, or skip it.
                      </div>
                    )}

                    {draft.source_excerpt && (
                      <div style={{ fontSize: '0.75rem', color: '#888' }}>
                        Parsed from: &ldquo;{draft.source_excerpt}&rdquo;
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#666' }}>
              Only selected rows will be imported.
            </p>
            <button type="button" onClick={handleImport} disabled={importing || selectedCount === 0 || selectableDraftIds.length === 0} style={{ padding: '0.5rem 1rem' }}>
              {importing ? 'Importing...' : 'Import selected contacts'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
