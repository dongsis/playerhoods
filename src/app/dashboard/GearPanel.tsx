'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GearImageManager } from './GearImageManager'
import { GEAR_CATEGORY_OPTIONS, GEAR_SECTION_OPTIONS, getGearCategoryLabel, OWNED_STATUS_OPTIONS, RACKET_TYPE_OPTIONS, STRING_SHAPE_OPTIONS, WISHLIST_PRIORITY_OPTIONS, WISHLIST_STATUS_OPTIONS } from '@/lib/gear-options'
import { type GearLinkConfidenceField, type GearLinkFieldConfidence, type GearLinkImportDraft } from '@/lib/gear-link-import'
import { recognizeRacketFromPhotoHints } from '@/lib/gear-racket-recognition'
import type { GearImage, GearItem, GearShowcaseEntry, GearStringJob, Json } from '@/lib/types/database'
import type { GearImageInput, GearItemInput, GearShowcaseEntryInput, GearStringJobInput } from '@/lib/api/gear'

type GearSection = 'showcase' | 'owned' | 'wishlist'
type LinkImportConfidenceMap = Partial<Record<GearLinkConfidenceField, GearLinkFieldConfidence>>

type Props = {
  userId: string
  items: GearItem[]
  images: GearImage[]
  stringJobs: GearStringJob[]
  showcaseEntries: GearShowcaseEntry[]
  onCreateItem: (input: GearItemInput) => Promise<GearItem>
  onUpdateItem: (itemId: string, input: Partial<GearItemInput>) => Promise<GearItem>
  onDeleteItem: (itemId: string) => Promise<void>
  onArchiveItem: (itemId: string, archived: boolean) => Promise<GearItem>
  onMoveWishlistToOwned: (itemId: string) => Promise<GearItem>
  onCreateImage: (input: GearImageInput) => Promise<GearImage>
  onUpdateImage: (imageId: string, input: Partial<GearImageInput>) => Promise<GearImage>
  onDeleteImage: (imageId: string) => Promise<void>
  onCreateStringJob: (input: GearStringJobInput) => Promise<GearStringJob>
  onDeleteStringJob: (jobId: string) => Promise<void>
  onUpsertShowcase: (input: GearShowcaseEntryInput) => Promise<GearShowcaseEntry>
  onDeleteShowcase: (entryId: string) => Promise<void>
  onImportWishlistLink: (url: string) => Promise<GearLinkImportDraft>
}

type GearDraft = {
  collection_type: 'owned' | 'wishlist'
  category: GearItem['category']
  item_name: string
  gear_type: string
  current_status: string
  purchase_date: string
  purchase_price: string
  source_link: string
  source_price: string
  bought_from: string
  nickname: string
  notes: string
  brand: string
  suitable_for: string
  head_size: string
  string_pattern: string
  length: string
  grip_size: string
  wishlist_status: string
  wishlist_priority: string
  visible_in_showcase: boolean
  showcase_note: string
  recognition_confidence: string
  recognition_detected_text: string[]
  imported_image_url: string
  imported_parser_label: string
  imported_notes: string[]
  imported_detected_fields: string[]
  imported_confidence: LinkImportConfidenceMap
}

function readMetadataString(metadata: Json, key: string): string {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return ''
  const value = metadata[key]
  return typeof value === 'string' ? value : ''
}

function readMetadataStringArray(metadata: Json, key: string): string[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return []
  const value = metadata[key]
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readMetadataConfidenceMap(metadata: Json, key: string): LinkImportConfidenceMap {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const value = metadata[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: LinkImportConfidenceMap = {}
  for (const [field, confidence] of Object.entries(value)) {
    if (confidence === 'high' || confidence === 'medium' || confidence === 'low') {
      result[field as GearLinkConfidenceField] = confidence
    }
  }
  return result
}

function buildDraftFromItem(item?: GearItem, collection: 'owned' | 'wishlist' = 'owned'): GearDraft {
  return {
    collection_type: item?.collection_type ?? collection,
    category: item?.category ?? 'rackets',
    item_name: item?.item_name ?? '',
    gear_type: item?.gear_type ?? '',
    current_status: item?.current_status ?? '',
    purchase_date: item?.purchase_date ?? '',
    purchase_price: item?.purchase_price != null ? String(item.purchase_price) : '',
    source_link: item?.source_link ?? '',
    source_price: item?.source_price != null ? String(item.source_price) : '',
    bought_from: item?.bought_from ?? '',
    nickname: item?.nickname ?? '',
    notes: item?.notes ?? '',
    brand: readMetadataString(item?.metadata ?? {}, 'brand'),
    suitable_for: readMetadataStringArray(item?.metadata ?? {}, 'suitable_for').join(', '),
    head_size: readMetadataString(item?.metadata ?? {}, 'head_size'),
    string_pattern: readMetadataString(item?.metadata ?? {}, 'string_pattern'),
    length: readMetadataString(item?.metadata ?? {}, 'length'),
    grip_size: readMetadataString(item?.metadata ?? {}, 'grip_size'),
    wishlist_status: readMetadataString(item?.metadata ?? {}, 'wishlist_status'),
    wishlist_priority: readMetadataString(item?.metadata ?? {}, 'wishlist_priority'),
    visible_in_showcase: item?.visible_in_showcase ?? false,
    showcase_note: item?.showcase_note ?? '',
    recognition_confidence: item?.recognition_confidence ?? '',
    recognition_detected_text: item?.recognition_detected_text ?? [],
    imported_image_url: readMetadataString(item?.metadata ?? {}, 'imported_image_url'),
    imported_parser_label: readMetadataString(item?.metadata ?? {}, 'imported_parser_label'),
    imported_notes: readMetadataStringArray(item?.metadata ?? {}, 'imported_notes'),
    imported_detected_fields: readMetadataStringArray(item?.metadata ?? {}, 'imported_detected_fields'),
    imported_confidence: readMetadataConfidenceMap(item?.metadata ?? {}, 'imported_confidence'),
  }
}

function buildItemInput(draft: GearDraft): GearItemInput {
  const suitableFor = draft.suitable_for
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)

  return {
    collection_type: draft.collection_type,
    category: draft.category,
    item_name: draft.item_name,
    gear_type: draft.gear_type || null,
    current_status: draft.current_status || null,
    purchase_date: draft.purchase_date || null,
    purchase_price: draft.purchase_price ? Number.parseFloat(draft.purchase_price) : null,
    source_link: draft.source_link || null,
    source_price: draft.source_price ? Number.parseFloat(draft.source_price) : null,
    bought_from: draft.bought_from || null,
    nickname: draft.nickname || null,
    notes: draft.notes || null,
    metadata: {
      brand: draft.brand || null,
      suitable_for: suitableFor,
      head_size: draft.head_size || null,
      string_pattern: draft.string_pattern || null,
      length: draft.length || null,
      grip_size: draft.grip_size || null,
      wishlist_status: draft.wishlist_status || null,
      wishlist_priority: draft.wishlist_priority || null,
      imported_image_url: draft.imported_image_url || null,
      imported_parser_label: draft.imported_parser_label || null,
      imported_notes: draft.imported_notes,
      imported_detected_fields: draft.imported_detected_fields,
      imported_confidence: draft.imported_confidence,
    },
    recognition_confidence: draft.recognition_confidence || null,
    recognition_detected_text: draft.recognition_detected_text,
    visible_in_showcase: draft.visible_in_showcase,
    showcase_note: draft.showcase_note || null,
  }
}

function coverImageForItem(images: GearImage[]): GearImage | null {
  return images.find((image) => image.is_cover) ?? images[0] ?? null
}

function racketSupportsStringJobs(item: GearItem): boolean {
  if (item.category !== 'rackets') return false
  return (
    item.gear_type === 'Tennis Racket'
    || item.gear_type === 'Tennis Racquet'
    || item.gear_type === 'Badminton Racket'
    || item.gear_type === 'Badminton Racquet'
    || item.gear_type === ''
  )
}

function CardButton({
  active,
  children,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-body-main rounded-2xl px-4 py-2.5 font-medium transition ${
        active
          ? 'bg-[#C25E46] text-white shadow-[0_12px_24px_-16px_rgba(194,94,70,0.55)]'
          : 'border border-[#E2E8F0] bg-white text-[#475569] hover:border-[#C25E46]/35 hover:bg-[#F8FBFF]'
      }`}
    >
      {children}
    </button>
  )
}

function ConfidenceBadge({ value }: { value?: GearLinkFieldConfidence }) {
  if (!value) return null
  const className =
    value === 'high'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'medium'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-rose-50 text-rose-700'
  return (
    <span className={`text-label rounded-full px-2.5 py-1 ${className}`}>
      {value}
    </span>
  )
}

function LinkImportReview({
  draft,
}: {
  draft: GearDraft
}) {
  if (!draft.imported_parser_label) return null

  const fields: Array<{ label: string; value: string | null | undefined; confidence?: GearLinkFieldConfidence }> = [
    { label: 'Name', value: draft.item_name, confidence: draft.imported_confidence.item_name },
    { label: 'Category', value: getGearCategoryLabel(draft.category), confidence: draft.imported_confidence.category },
    { label: 'Brand', value: draft.brand, confidence: draft.imported_confidence.brand },
    { label: 'Price', value: draft.source_price ? `$${draft.source_price}` : '', confidence: draft.imported_confidence.price },
    { label: 'Racquet type', value: draft.gear_type, confidence: draft.imported_confidence.gear_type },
    { label: 'Head size', value: draft.head_size, confidence: draft.imported_confidence.head_size },
    { label: 'String pattern', value: draft.string_pattern, confidence: draft.imported_confidence.string_pattern },
    { label: 'Length', value: draft.length, confidence: draft.imported_confidence.length },
    { label: 'Grip size', value: draft.grip_size, confidence: draft.imported_confidence.grip_size },
  ].filter((field) => Boolean(field.value))

  return (
    <section className="mt-5 rounded-[24px] border border-sky-100 bg-sky-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-title-main text-slate-900">Imported draft review</h4>
          <p className="text-body-sub mt-1 text-slate-500">
            Parsed with {draft.imported_parser_label}. Review anything uncertain before saving.
          </p>
        </div>
        <ConfidenceBadge value={draft.imported_confidence.item_name} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[160px_minmax(0,1fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {draft.imported_image_url ? (
            <img src={draft.imported_image_url} alt={draft.item_name || 'Imported gear'} className="h-40 w-full object-contain" />
          ) : (
            <div className="text-body-main flex h-40 items-center justify-center px-4 text-center text-slate-400">No image detected</div>
          )}
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {draft.imported_detected_fields.map((field) => (
              <span key={field} className="text-body-sub rounded-full bg-white px-3 py-1 font-medium text-slate-600">
                {field.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {fields.map((field) => (
              <div key={field.label} className="rounded-2xl border border-white bg-white px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-label text-slate-400">{field.label}</p>
                  <ConfidenceBadge value={field.confidence} />
                </div>
                <p className="text-body-main mt-1 text-slate-700">{field.value}</p>
              </div>
            ))}
          </div>
          {draft.imported_notes.length > 0 && (
            <div className="text-body-main rounded-2xl border border-white bg-white px-3 py-3 text-slate-600">
              {draft.imported_notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function StringJobsSection({
  item,
  jobs,
  onCreateStringJob,
  onDeleteStringJob,
}: {
  item: GearItem
  jobs: GearStringJob[]
  onCreateStringJob: (input: GearStringJobInput) => Promise<GearStringJob>
  onDeleteStringJob: (jobId: string) => Promise<void>
}) {
  const [draft, setDraft] = useState({
    strung_at: '',
    string_name: '',
    string_brand: '',
    string_type: '',
    string_shape: '',
    gauge: '',
    tension_mains: '',
    tension_crosses: '',
    strung_by: '',
    cost: '',
    first_impression: '',
    follow_up_feel: '',
    ended_at: '',
    ended_reason: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!draft.strung_at) {
      setError('Date is required for a string job.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onCreateStringJob({
        gear_item_id: item.id,
        strung_at: draft.strung_at,
        string_name: draft.string_name || null,
        string_brand: draft.string_brand || null,
        string_type: draft.string_type || null,
        string_shape: draft.string_shape || null,
        gauge: draft.gauge || null,
        tension_mains: draft.tension_mains ? Number.parseFloat(draft.tension_mains) : null,
        tension_crosses: draft.tension_crosses ? Number.parseFloat(draft.tension_crosses) : null,
        strung_by: draft.strung_by || null,
        cost: draft.cost ? Number.parseFloat(draft.cost) : null,
        first_impression: draft.first_impression || null,
        follow_up_feel: draft.follow_up_feel || null,
        ended_at: draft.ended_at || null,
        ended_reason: draft.ended_reason || null,
      })
      setDraft({
        strung_at: '',
        string_name: '',
        string_brand: '',
        string_type: '',
        string_shape: '',
        gauge: '',
        tension_mains: '',
        tension_crosses: '',
        strung_by: '',
        cost: '',
        first_impression: '',
        follow_up_feel: '',
        ended_at: '',
        ended_reason: '',
      })
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Could not save string job.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-4 border-t border-slate-200 pt-5">
      <div>
        <h4 className="text-title-main text-slate-900">String Jobs</h4>
        <p className="text-body-sub mt-1 text-slate-500">Track each restring as its own history entry.</p>
      </div>
      <div className="grid gap-3 rounded-[24px] border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
        <input type="date" value={draft.strung_at} onChange={(event) => setDraft((previous) => ({ ...previous, strung_at: event.target.value }))} className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.string_name} onChange={(event) => setDraft((previous) => ({ ...previous, string_name: event.target.value }))} placeholder="String name" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.string_brand} onChange={(event) => setDraft((previous) => ({ ...previous, string_brand: event.target.value }))} placeholder="String brand" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.string_type} onChange={(event) => setDraft((previous) => ({ ...previous, string_type: event.target.value }))} placeholder="String type" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <select value={draft.string_shape} onChange={(event) => setDraft((previous) => ({ ...previous, string_shape: event.target.value }))} className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4">
          <option value="">Shape</option>
          {STRING_SHAPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        <input value={draft.gauge} onChange={(event) => setDraft((previous) => ({ ...previous, gauge: event.target.value }))} placeholder="Gauge" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.tension_mains} onChange={(event) => setDraft((previous) => ({ ...previous, tension_mains: event.target.value }))} placeholder="Tension mains" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.tension_crosses} onChange={(event) => setDraft((previous) => ({ ...previous, tension_crosses: event.target.value }))} placeholder="Tension crosses" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.strung_by} onChange={(event) => setDraft((previous) => ({ ...previous, strung_by: event.target.value }))} placeholder="Who strung it" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.cost} onChange={(event) => setDraft((previous) => ({ ...previous, cost: event.target.value }))} placeholder="Cost" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <textarea value={draft.first_impression} onChange={(event) => setDraft((previous) => ({ ...previous, first_impression: event.target.value }))} placeholder="First impression" className="text-body-main min-h-[84px] rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2" />
        <textarea value={draft.follow_up_feel} onChange={(event) => setDraft((previous) => ({ ...previous, follow_up_feel: event.target.value }))} placeholder="Follow-up feel" className="text-body-main min-h-[84px] rounded-2xl border border-slate-200 bg-white px-4 py-3 md:col-span-2" />
        <input type="date" value={draft.ended_at} onChange={(event) => setDraft((previous) => ({ ...previous, ended_at: event.target.value }))} className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <input value={draft.ended_reason} onChange={(event) => setDraft((previous) => ({ ...previous, ended_reason: event.target.value }))} placeholder="Ended reason" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
        <div className="md:col-span-2">
          <button type="button" onClick={() => void save()} disabled={busy} className="text-body-main rounded-2xl bg-slate-900 px-4 py-2.5 font-medium text-white">
            {busy ? 'Saving...' : 'Add string job'}
          </button>
        </div>
        {error && <p className="text-body-main text-rose-500 md:col-span-2">{error}</p>}
      </div>
      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="text-body-main rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-4 text-slate-500">No string jobs yet.</div>
        ) : (
          jobs.map((job) => (
            <div key={job.id} className="rounded-[24px] border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-title-main text-slate-900">{job.string_name || 'Unnamed string job'}</p>
                  <p className="text-body-sub mt-1 text-slate-500">
                    {job.strung_at}
                    {job.string_brand ? ` · ${job.string_brand}` : ''}
                    {job.gauge ? ` · ${job.gauge}` : ''}
                    {job.tension_mains != null ? ` · ${job.tension_mains}/${job.tension_crosses ?? job.tension_mains}` : ''}
                  </p>
                </div>
                <button type="button" onClick={() => void onDeleteStringJob(job.id)} className="text-body-sub rounded-2xl bg-rose-50 px-3 py-2 font-medium text-rose-700">Remove</button>
              </div>
              {(job.first_impression || job.follow_up_feel || job.ended_reason) && (
                <div className="text-body-main mt-3 space-y-2 text-slate-600">
                  {job.first_impression && <p>First impression: {job.first_impression}</p>}
                  {job.follow_up_feel && <p>Follow-up feel: {job.follow_up_feel}</p>}
                  {job.ended_reason && <p>Ended: {job.ended_reason}</p>}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  )
}

function GearItemEditor({
  userId,
  section,
  item,
  itemImages,
  itemStringJobs,
  onBack,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onArchiveItem,
  onMoveWishlistToOwned,
  onCreateImage,
  onUpdateImage,
  onDeleteImage,
  onCreateStringJob,
  onDeleteStringJob,
  onUpsertShowcase,
  onDeleteShowcase,
  initialDraft,
  addMode,
}: {
  userId: string
  section: GearSection
  item?: GearItem
  itemImages: GearImage[]
  itemStringJobs: GearStringJob[]
  onBack: () => void
  onCreateItem: (input: GearItemInput) => Promise<GearItem>
  onUpdateItem: (itemId: string, input: Partial<GearItemInput>) => Promise<GearItem>
  onDeleteItem: (itemId: string) => Promise<void>
  onArchiveItem: (itemId: string, archived: boolean) => Promise<GearItem>
  onMoveWishlistToOwned: (itemId: string) => Promise<GearItem>
  onCreateImage: (input: GearImageInput) => Promise<GearImage>
  onUpdateImage: (imageId: string, input: Partial<GearImageInput>) => Promise<GearImage>
  onDeleteImage: (imageId: string) => Promise<void>
  onCreateStringJob: (input: GearStringJobInput) => Promise<GearStringJob>
  onDeleteStringJob: (jobId: string) => Promise<void>
  onUpsertShowcase: (input: GearShowcaseEntryInput) => Promise<GearShowcaseEntry>
  onDeleteShowcase: (entryId: string) => Promise<void>
  initialDraft?: GearDraft
  addMode?: 'manual' | 'link' | 'photos'
}) {
  const router = useRouter()
  const [draft, setDraft] = useState<GearDraft>(initialDraft ?? buildDraftFromItem(item, section === 'wishlist' ? 'wishlist' : 'owned'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [photoFiles, setPhotoFiles] = useState<File[]>([])
  const [manualHints, setManualHints] = useState('')
  const isExisting = Boolean(item)
  const isWishlist = draft.collection_type === 'wishlist'
  const detailTitle = isExisting ? item?.item_name ?? 'Gear item' : isWishlist ? 'New wishlist item' : 'New owned gear item'

  const save = async () => {
    if (!draft.item_name.trim()) {
      setError('Item name is required.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const input = buildItemInput(draft)
      const savedItem = item
        ? await onUpdateItem(item.id, input)
        : await onCreateItem(input)

      if (draft.visible_in_showcase) {
        await onUpsertShowcase({
          source_type: savedItem.collection_type === 'owned' ? 'owned_item' : 'wishlist_item',
          gear_item_id: savedItem.id,
          is_visible: true,
          display_note: draft.showcase_note || null,
        })
      } else if (savedItem.visible_in_showcase === false) {
        const existingEntry = savedItem.id
        void existingEntry
      }

      if (!item && addMode === 'photos' && photoFiles.length > 0) {
        const supabase = (await import('@/lib/supabase/client')).createSupabaseBrowserClient()
        for (const [index, file] of photoFiles.entries()) {
          const path = `${userId}/${savedItem.id}/${Date.now()}-${index}-${file.name.replace(/[^a-zA-Z0-9.-]+/g, '-')}`
          const { error: uploadError } = await supabase.storage
            .from('gear-media')
            .upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' })
          if (uploadError) throw uploadError
          const { data } = supabase.storage.from('gear-media').getPublicUrl(path)
          await onCreateImage({
            gear_item_id: savedItem.id,
            image_kind: 'item',
            storage_path: path,
            public_url: `${data.publicUrl}?t=${Date.now()}`,
            sort_order: index,
            is_cover: index === 0,
          })
        }
      }

      router.refresh()
    } catch (err: unknown) {
      setError((err as { message?: string })?.message ?? 'Could not save item.')
    } finally {
      setSaving(false)
    }
  }

  const detectFromPhotos = () => {
    const result = recognizeRacketFromPhotoHints(photoFiles, manualHints)
    setDraft((previous) => ({
      ...previous,
      item_name: result.racket_name ?? previous.item_name,
      gear_type: result.racket_type,
      recognition_confidence: result.confidence,
      recognition_detected_text: result.detected_text,
      brand: result.racket_name?.split(' ')[0] ?? previous.brand,
    }))
  }

  const metadataNote = draft.recognition_detected_text.length > 0
    ? `Detected hints: ${draft.recognition_detected_text.join(', ')}`
    : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="text-body-main font-medium text-slate-500 hover:text-slate-900">
          ← Back
        </button>
        <div className="flex flex-wrap gap-2">
          {item && (
            <>
              <button type="button" onClick={() => void onArchiveItem(item.id, item.archived_at == null)} className="text-body-main rounded-2xl bg-slate-100 px-4 py-2 font-medium text-slate-700">
                {item.archived_at ? 'Unarchive' : 'Archive'}
              </button>
              {item.collection_type === 'wishlist' && (
                <button type="button" onClick={() => void onMoveWishlistToOwned(item.id)} className="text-body-main rounded-2xl bg-emerald-100 px-4 py-2 font-medium text-emerald-800">
                  Move to Owned Gear
                </button>
              )}
              <button type="button" onClick={() => void onDeleteItem(item.id)} className="text-body-main rounded-2xl bg-rose-50 px-4 py-2 font-medium text-rose-700">
                Delete
              </button>
            </>
          )}
          <button type="button" onClick={() => void save()} disabled={saving} className="text-body-main rounded-2xl bg-slate-900 px-4 py-2 font-medium text-white">
            {saving ? 'Saving...' : isExisting ? 'Save changes' : 'Save item'}
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
        <h3 className="text-h1 text-slate-900">{detailTitle}</h3>
        <p className="text-body-sub mt-1 text-slate-500">
          {isWishlist ? 'Wishlist keeps lighter product notes and links.' : 'Owned gear keeps your usage, photos, and history together.'}
        </p>
        {addMode === 'link' && !isExisting && <LinkImportReview draft={draft} />}

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-label mb-1.5 block text-slate-400">Item name</label>
            <input value={draft.item_name} onChange={(event) => setDraft((previous) => ({ ...previous, item_name: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
          </div>
          <div>
            <label className="text-label mb-1.5 block text-slate-400">Category</label>
            <select value={draft.category} onChange={(event) => setDraft((previous) => ({ ...previous, category: event.target.value as GearItem['category'] }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4">
              {GEAR_CATEGORY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          {draft.category === 'rackets' && (
            <div>
              <label className="text-label mb-1.5 block text-slate-400">Racquet type</label>
              <select value={draft.gear_type} onChange={(event) => setDraft((previous) => ({ ...previous, gear_type: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4">
                <option value="">Select type...</option>
                {RACKET_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="text-label mb-1.5 block text-slate-400">Brand</label>
            <input value={draft.brand} onChange={(event) => setDraft((previous) => ({ ...previous, brand: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
          </div>
          {!isWishlist && (
            <>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Current status</label>
                <select value={draft.current_status} onChange={(event) => setDraft((previous) => ({ ...previous, current_status: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4">
                  <option value="">Select status...</option>
                  {OWNED_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Nickname</label>
                <input value={draft.nickname} onChange={(event) => setDraft((previous) => ({ ...previous, nickname: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Purchase date</label>
                <input type="date" value={draft.purchase_date} onChange={(event) => setDraft((previous) => ({ ...previous, purchase_date: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Purchase price</label>
                <input value={draft.purchase_price} onChange={(event) => setDraft((previous) => ({ ...previous, purchase_price: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Bought from</label>
                <input value={draft.bought_from} onChange={(event) => setDraft((previous) => ({ ...previous, bought_from: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Suitable for / sport tags</label>
                <input value={draft.suitable_for} onChange={(event) => setDraft((previous) => ({ ...previous, suitable_for: event.target.value }))} placeholder="Tennis, hard court, club nights" className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
            </>
          )}
          {isWishlist && (
            <>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Status</label>
                <select value={draft.wishlist_status} onChange={(event) => setDraft((previous) => ({ ...previous, wishlist_status: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4">
                  <option value="">Select status...</option>
                  {WISHLIST_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Priority</label>
                <select value={draft.wishlist_priority} onChange={(event) => setDraft((previous) => ({ ...previous, wishlist_priority: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4">
                  <option value="">Select priority...</option>
                  {WISHLIST_PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Source link</label>
                <input value={draft.source_link} onChange={(event) => setDraft((previous) => ({ ...previous, source_link: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Price</label>
                <input value={draft.source_price} onChange={(event) => setDraft((previous) => ({ ...previous, source_price: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
            </>
          )}
          {draft.category === 'rackets' && (
            <>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Head size</label>
                <input value={draft.head_size} onChange={(event) => setDraft((previous) => ({ ...previous, head_size: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">String pattern</label>
                <input value={draft.string_pattern} onChange={(event) => setDraft((previous) => ({ ...previous, string_pattern: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Length</label>
                <input value={draft.length} onChange={(event) => setDraft((previous) => ({ ...previous, length: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
              <div>
                <label className="text-label mb-1.5 block text-slate-400">Grip size</label>
                <input value={draft.grip_size} onChange={(event) => setDraft((previous) => ({ ...previous, grip_size: event.target.value }))} className="text-body-main h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
              </div>
            </>
          )}
          <div className="md:col-span-2">
            <label className="text-label mb-1.5 block text-slate-400">Notes</label>
            <textarea value={draft.notes} onChange={(event) => setDraft((previous) => ({ ...previous, notes: event.target.value }))} className="text-body-main min-h-[96px] w-full rounded-2xl border border-slate-200 bg-white px-4 py-3" />
          </div>
          <div className="md:col-span-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h4 className="text-title-main text-slate-900">Showcase</h4>
                <p className="text-body-sub mt-1 text-slate-500">Control whether this item appears publicly in your Gear showcase.</p>
              </div>
              <label className="text-body-main inline-flex items-center gap-2 text-slate-700">
                <input type="checkbox" checked={draft.visible_in_showcase} onChange={(event) => setDraft((previous) => ({ ...previous, visible_in_showcase: event.target.checked }))} />
                Visible publicly
              </label>
            </div>
            <input value={draft.showcase_note} onChange={(event) => setDraft((previous) => ({ ...previous, showcase_note: event.target.value }))} placeholder="Short display note" className="text-body-main mt-3 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4" />
          </div>
        </section>
        {addMode === 'photos' && draft.category === 'rackets' && !isExisting && (
          <section className="mt-5 space-y-4 border-t border-slate-200 pt-5">
            <div>
              <h4 className="text-title-main text-slate-900">Add from Photos</h4>
              <p className="text-body-sub mt-1 text-slate-500">
                Upload racquet photos first. We will draft a model guess from the photo filenames and any visible text you add here.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhotoFiles(Array.from(event.target.files ?? []))} className="text-body-main block w-full" />
              <input value={manualHints} onChange={(event) => setManualHints(event.target.value)} placeholder="Optional visible text or specs you can read" className="text-body-main h-11 rounded-2xl border border-slate-200 bg-white px-4" />
            </div>
            <button type="button" onClick={detectFromPhotos} disabled={photoFiles.length === 0} className="text-body-main rounded-2xl bg-slate-100 px-4 py-2.5 font-medium text-slate-700 disabled:opacity-50">
              Generate draft from photos
            </button>
            {draft.recognition_confidence && (
              <div className="text-body-main rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-600">
                <p className="font-medium text-slate-900">Recognition confidence: {draft.recognition_confidence}</p>
                {metadataNote && <p className="mt-1">{metadataNote}</p>}
              </div>
            )}
          </section>
        )}
        {error && <p className="text-body-main mt-4 text-rose-500">{error}</p>}
      </div>

      <section className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
        <div>
          <h4 className="text-title-main text-slate-900">Photos</h4>
          <p className="text-body-sub mt-1 text-slate-500">Manage multiple photos, cover image, captions, and background-removed versions.</p>
        </div>
        {item ? (
          <GearImageManager
            userId={userId}
            gearItemId={item.id}
            images={itemImages}
            emptyLabel="No photos yet for this item."
            onCreateImage={onCreateImage}
            onUpdateImage={onUpdateImage}
            onDeleteImage={onDeleteImage}
          />
        ) : (
          <div className="text-body-main rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-slate-500">
            Save the item first, then you can manage its photos in full.
          </div>
        )}
      </section>

      {!isWishlist && item && racketSupportsStringJobs(item) && (
        <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
          <StringJobsSection item={item} jobs={itemStringJobs} onCreateStringJob={onCreateStringJob} onDeleteStringJob={onDeleteStringJob} />
        </div>
      )}

      {item && !draft.visible_in_showcase && (
        <div className="text-body-main rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-slate-500">
          This item is currently private and not shown in Showcase.
        </div>
      )}
    </div>
  )
}

function ShowcasePanel({
  items,
  images,
  showcaseEntries,
  onOpenItem,
  onCreateImage,
  onUpdateImage,
  onDeleteImage,
  onUpsertShowcase,
  onDeleteShowcase,
  userId,
}: {
  items: GearItem[]
  images: GearImage[]
  showcaseEntries: GearShowcaseEntry[]
  onOpenItem: (itemId: string) => void
  onCreateImage: (input: GearImageInput) => Promise<GearImage>
  onUpdateImage: (imageId: string, input: Partial<GearImageInput>) => Promise<GearImage>
  onDeleteImage: (imageId: string) => Promise<void>
  onUpsertShowcase: (input: GearShowcaseEntryInput) => Promise<GearShowcaseEntry>
  onDeleteShowcase: (entryId: string) => Promise<void>
  userId: string
}) {
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const imageMap = useMemo(() => new Map(images.map((image) => [image.id, image])), [images])
  const standalonePhotos = useMemo(() => images.filter((image) => image.image_kind === 'setup_photo'), [images])
  const visibleEntries = useMemo(
    () => [...showcaseEntries].sort((left, right) => Number(right.pinned) - Number(left.pinned) || left.sort_order - right.sort_order),
    [showcaseEntries],
  )
  const coverEntry = visibleEntries.find((entry) => entry.is_cover) ?? visibleEntries[0] ?? null

  const previewImageUrl = coverEntry
    ? coverEntry.gear_image_id
      ? (imageMap.get(coverEntry.gear_image_id)?.cutout_public_url || imageMap.get(coverEntry.gear_image_id)?.public_url || null)
      : (() => {
          const showcaseItem = coverEntry.gear_item_id ? itemMap.get(coverEntry.gear_item_id) : null
          if (!showcaseItem) return null
          const itemImages = images.filter((image) => image.gear_item_id === showcaseItem.id)
          return coverImageForItem(itemImages)?.cutout_public_url || coverImageForItem(itemImages)?.public_url || null
        })()
    : null

  return (
    <div className="space-y-6">
      <div className="rounded-[30px] border border-slate-200 bg-white p-6 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-h1 text-slate-900">Public preview</h3>
            <p className="text-body-sub mt-1 text-slate-500">Preview what others will see when you choose to show gear publicly.</p>
          </div>
          <span className="text-label rounded-full bg-slate-100 px-3 py-1 text-slate-500">
            {visibleEntries.filter((entry) => entry.is_visible).length} visible
          </span>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="overflow-hidden rounded-[28px] border border-slate-100 bg-slate-50">
            {previewImageUrl ? (
              <img src={previewImageUrl} alt="Showcase preview cover" className="h-[320px] w-full object-contain" />
            ) : (
              <div className="text-body-main flex h-[320px] items-center justify-center text-slate-400">No cover image selected yet.</div>
            )}
          </div>
          <div className="space-y-3">
            {visibleEntries.slice(0, 4).map((entry) => {
              const item = entry.gear_item_id ? itemMap.get(entry.gear_item_id) : null
              const photo = entry.gear_image_id ? imageMap.get(entry.gear_image_id) : null
              return (
                <div key={entry.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-body-main font-medium text-slate-900">{item?.item_name ?? photo?.caption ?? 'Setup photo'}</p>
                  {entry.display_note && <p className="text-body-sub mt-1 text-slate-500">{entry.display_note}</p>}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)]">
        <div className="mb-4">
          <h4 className="text-title-main text-slate-900">Setup / look photos</h4>
          <p className="text-body-sub mt-1 text-slate-500">Upload standalone photos like full setups, outfit shots, or artwork and choose whether to show them publicly.</p>
        </div>
        <GearImageManager
          userId={userId}
          imageKind="setup_photo"
          images={standalonePhotos}
          emptyLabel="No standalone showcase photos yet."
          onCreateImage={async (input) => {
            const created = await onCreateImage(input)
            await onUpsertShowcase({ source_type: 'photo', gear_image_id: created.id, is_visible: true })
            return created
          }}
          onUpdateImage={onUpdateImage}
          onDeleteImage={onDeleteImage}
        />
      </div>

      <div className="space-y-3">
        {visibleEntries.length === 0 ? (
          <div className="text-body-main rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-5 py-5 text-slate-500">
            Nothing is in Showcase yet. Add items from Owned Gear or Wishlist, or upload setup photos here.
          </div>
        ) : (
          visibleEntries.map((entry) => {
            const item = entry.gear_item_id ? itemMap.get(entry.gear_item_id) : null
            const photo = entry.gear_image_id ? imageMap.get(entry.gear_image_id) : null
            return (
              <div key={entry.id} className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_14px_30px_-26px_rgba(15,23,42,0.35)]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-title-main text-slate-900">{item?.item_name ?? photo?.caption ?? 'Setup photo'}</p>
                    <p className="text-body-sub mt-1 text-slate-500">
                      {item ? `${item.collection_type === 'owned' ? 'Owned Gear' : 'Wishlist'} · ${getGearCategoryLabel(item.category)}` : 'Setup photo'}
                    </p>
                  </div>
                  {item && (
                    <button type="button" onClick={() => onOpenItem(item.id)} className="text-body-sub rounded-2xl bg-slate-100 px-3 py-2 font-medium text-slate-700">
                      Open detail
                    </button>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void onUpsertShowcase({ source_type: entry.source_type, gear_item_id: entry.gear_item_id ?? null, gear_image_id: entry.gear_image_id ?? null, is_visible: !entry.is_visible, pinned: entry.pinned, is_cover: entry.is_cover, sort_order: entry.sort_order, display_note: entry.display_note })} className="text-body-sub rounded-2xl bg-slate-100 px-3 py-2 font-medium text-slate-700">
                    {entry.is_visible ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" onClick={() => void onUpsertShowcase({ source_type: entry.source_type, gear_item_id: entry.gear_item_id ?? null, gear_image_id: entry.gear_image_id ?? null, is_visible: entry.is_visible, pinned: !entry.pinned, is_cover: entry.is_cover, sort_order: entry.sort_order, display_note: entry.display_note })} className="text-body-sub rounded-2xl bg-slate-100 px-3 py-2 font-medium text-slate-700">
                    {entry.pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button type="button" onClick={() => void Promise.all(visibleEntries.map((candidate) => onUpsertShowcase({ source_type: candidate.source_type, gear_item_id: candidate.gear_item_id ?? null, gear_image_id: candidate.gear_image_id ?? null, is_visible: candidate.is_visible, pinned: candidate.pinned, is_cover: candidate.id === entry.id, sort_order: candidate.sort_order, display_note: candidate.display_note })))} className="text-body-sub rounded-2xl bg-amber-50 px-3 py-2 font-medium text-amber-700">
                    {entry.is_cover ? 'Cover image' : 'Make cover'}
                  </button>
                  <button type="button" onClick={() => void onDeleteShowcase(entry.id)} className="text-body-sub rounded-2xl bg-rose-50 px-3 py-2 font-medium text-rose-700">
                    Remove
                  </button>
                </div>
                <input
                  type="text"
                  defaultValue={entry.display_note ?? ''}
                  onBlur={(event) => void onUpsertShowcase({ source_type: entry.source_type, gear_item_id: entry.gear_item_id ?? null, gear_image_id: entry.gear_image_id ?? null, is_visible: entry.is_visible, pinned: entry.pinned, is_cover: entry.is_cover, sort_order: entry.sort_order, display_note: event.target.value })}
                  placeholder="Short display note"
                  className="text-body-main mt-3 h-11 w-full rounded-2xl border border-slate-200 bg-white px-4"
                />
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export function GearPanel({
  userId,
  items,
  images,
  stringJobs,
  showcaseEntries,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
  onArchiveItem,
  onMoveWishlistToOwned,
  onCreateImage,
  onUpdateImage,
  onDeleteImage,
  onCreateStringJob,
  onDeleteStringJob,
  onUpsertShowcase,
  onDeleteShowcase,
  onImportWishlistLink,
}: Props) {
  const router = useRouter()
  const [section, setSection] = useState<GearSection>('showcase')
  const [category, setCategory] = useState<GearItem['category'] | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [composer, setComposer] = useState<null | { collection: 'owned' | 'wishlist'; mode: 'manual' | 'link' | 'photos'; initialDraft?: GearDraft }>(null)
  const [linkUrl, setLinkUrl] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  const itemImagesById = useMemo(() => {
    const map = new Map<string, GearImage[]>()
    for (const image of images) {
      if (!image.gear_item_id) continue
      const group = map.get(image.gear_item_id) ?? []
      group.push(image)
      map.set(image.gear_item_id, group)
    }
    return map
  }, [images])
  const stringJobsByItemId = useMemo(() => {
    const map = new Map<string, GearStringJob[]>()
    for (const job of stringJobs) {
      const group = map.get(job.gear_item_id) ?? []
      group.push(job)
      map.set(job.gear_item_id, group)
    }
    return map
  }, [stringJobs])
  const showcaseItemIds = useMemo(() => {
    return new Set(
      showcaseEntries
        .filter((entry) => entry.is_visible && entry.gear_item_id)
        .map((entry) => entry.gear_item_id as string),
    )
  }, [showcaseEntries])
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => item.collection_type === (section === 'wishlist' ? 'wishlist' : 'owned'))
      .filter((item) => category === 'all' || item.category === category)
      .filter((item) => {
        const haystack = `${item.item_name} ${item.gear_type ?? ''} ${item.notes ?? ''}`.toLowerCase()
        return haystack.includes(search.toLowerCase())
      })
  }, [category, items, search, section])
  const selectedItem = selectedItemId ? items.find((item) => item.id === selectedItemId) : undefined
  const composerNeedsEditor = composer != null && (composer.mode !== 'link' || composer.initialDraft != null)

  if (selectedItem || composerNeedsEditor) {
    return (
      <GearItemEditor
        key={selectedItem?.id ?? `${composer?.collection}-${composer?.mode}-${composer?.initialDraft?.item_name ?? 'new'}`}
        userId={userId}
        section={section}
        item={selectedItem}
        itemImages={selectedItem ? (itemImagesById.get(selectedItem.id) ?? []) : []}
        itemStringJobs={selectedItem ? (stringJobsByItemId.get(selectedItem.id) ?? []) : []}
        onBack={() => {
          setSelectedItemId(null)
          setComposer(null)
        }}
        onCreateItem={async (input) => {
          const created = await onCreateItem(input)
          setSelectedItemId(created.id)
          setComposer(null)
          router.refresh()
          return created
        }}
        onUpdateItem={async (itemId, input) => {
          const updated = await onUpdateItem(itemId, input)
          router.refresh()
          return updated
        }}
        onDeleteItem={async (itemId) => {
          await onDeleteItem(itemId)
          setSelectedItemId(null)
          router.refresh()
        }}
        onArchiveItem={async (itemId, archived) => {
          const result = await onArchiveItem(itemId, archived)
          router.refresh()
          return result
        }}
        onMoveWishlistToOwned={async (itemId) => {
          const moved = await onMoveWishlistToOwned(itemId)
          setSection('owned')
          router.refresh()
          return moved
        }}
        onCreateImage={async (input) => {
          const created = await onCreateImage(input)
          router.refresh()
          return created
        }}
        onUpdateImage={async (imageId, input) => {
          const updated = await onUpdateImage(imageId, input)
          router.refresh()
          return updated
        }}
        onDeleteImage={async (imageId) => {
          await onDeleteImage(imageId)
          router.refresh()
        }}
        onCreateStringJob={async (input) => {
          const created = await onCreateStringJob(input)
          router.refresh()
          return created
        }}
        onDeleteStringJob={async (jobId) => {
          await onDeleteStringJob(jobId)
          router.refresh()
        }}
        onUpsertShowcase={async (input) => {
          const result = await onUpsertShowcase(input)
          router.refresh()
          return result
        }}
        onDeleteShowcase={async (entryId) => {
          await onDeleteShowcase(entryId)
          router.refresh()
        }}
        initialDraft={composer?.initialDraft}
        addMode={composer?.mode}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-label text-[#94A3B8]">Equipment</div>
          <h2 className="text-h1 mt-1 text-[#1E293B]">Gear</h2>
          <p className="text-body-sub mt-1 text-[#64748B]">Manage what you own, what you want, and what you choose to show publicly.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {GEAR_SECTION_OPTIONS.map((option) => (
            <CardButton key={option.value} active={section === option.value} onClick={() => setSection(option.value)}>
              {option.label}
            </CardButton>
          ))}
        </div>
      </div>

      {section === 'showcase' ? (
        <ShowcasePanel
          userId={userId}
          items={items}
          images={images}
          showcaseEntries={showcaseEntries}
          onOpenItem={setSelectedItemId}
          onCreateImage={async (input) => {
            const created = await onCreateImage(input)
            router.refresh()
            return created
          }}
          onUpdateImage={async (imageId, input) => {
            const updated = await onUpdateImage(imageId, input)
            router.refresh()
            return updated
          }}
          onDeleteImage={async (imageId) => {
            await onDeleteImage(imageId)
            router.refresh()
          }}
          onUpsertShowcase={async (input) => {
            const result = await onUpsertShowcase(input)
            router.refresh()
            return result
          }}
          onDeleteShowcase={async (entryId) => {
            await onDeleteShowcase(entryId)
            router.refresh()
          }}
        />
      ) : (
        <>
          <div className="rounded-[28px] border border-[#E2E8F0] bg-white p-5 shadow-[0_18px_40px_-30px_rgba(30,41,59,0.16)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <CardButton active={category === 'all'} onClick={() => setCategory('all')}>All</CardButton>
                {GEAR_CATEGORY_OPTIONS.map((option) => (
                  <CardButton key={option.value} active={category === option.value} onClick={() => setCategory(option.value)}>
                    {option.label}
                  </CardButton>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${section === 'owned' ? 'owned gear' : 'wishlist'}...`} className="text-body-main h-11 min-w-[220px] rounded-2xl border border-[#E2E8F0] bg-white px-4 text-[#1E293B] outline-none transition focus:border-[#C25E46]" />
                <button type="button" onClick={() => setComposer({ collection: section === 'wishlist' ? 'wishlist' : 'owned', mode: 'manual' })} className="text-body-main rounded-2xl bg-[#C25E46] px-4 py-2.5 font-semibold text-white transition hover:bg-[#A64F3A]">Add manually</button>
                {section === 'wishlist' && <button type="button" onClick={() => setComposer({ collection: 'wishlist', mode: 'link' })} className="text-body-main rounded-2xl border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-2.5 font-medium text-[#475569] transition hover:border-[#C25E46]/35">Add from link</button>}
                {section === 'owned' && (category === 'all' || category === 'rackets') && <button type="button" onClick={() => setComposer({ collection: 'owned', mode: 'photos', initialDraft: { ...buildDraftFromItem(undefined, 'owned'), category: 'rackets', gear_type: 'Tennis Racquet' } })} className="text-body-main rounded-2xl bg-emerald-50 px-4 py-2.5 font-medium text-emerald-700">Add racquet from photos</button>}
              </div>
            </div>
            {composer?.mode === 'link' && section === 'wishlist' && (
              <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FBFF] p-4">
                <div className="flex flex-wrap gap-3">
                  <input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="Paste a product link" className="text-body-main h-11 min-w-[320px] flex-1 rounded-2xl border border-[#E2E8F0] bg-white px-4 text-[#1E293B] outline-none transition focus:border-[#C25E46]" />
                  <button type="button" disabled={linkLoading || !linkUrl.trim()} onClick={async () => {
                    setLinkLoading(true)
                    setLinkError(null)
                    try {
                      const imported = await onImportWishlistLink(linkUrl)
                      setComposer({
                        collection: 'wishlist',
                        mode: 'link',
                        initialDraft: {
                          ...buildDraftFromItem(undefined, 'wishlist'),
                          category: imported.category,
                          item_name: imported.item_name,
                          gear_type: imported.gear_type ?? '',
                          source_link: imported.source_link,
                          source_price: imported.source_price != null ? String(imported.source_price) : '',
                          brand: imported.brand ?? readMetadataString(imported.metadata, 'brand'),
                          head_size: imported.head_size ?? '',
                          string_pattern: imported.string_pattern ?? '',
                          length: imported.length ?? '',
                          grip_size: imported.grip_size ?? '',
                          wishlist_status: 'interested',
                          imported_image_url: imported.image_url ?? '',
                          imported_parser_label: imported.parser_label,
                          imported_notes: imported.notes,
                          imported_detected_fields: imported.detected_fields,
                          imported_confidence: imported.confidence,
                        },
                      })
                    } catch (err: unknown) {
                      setLinkError((err as { message?: string })?.message ?? 'Could not import from link.')
                    } finally {
                      setLinkLoading(false)
                    }
                  }} className="text-body-main rounded-2xl bg-[#C25E46] px-4 py-2.5 font-semibold text-white disabled:opacity-50">
                    {linkLoading ? 'Importing...' : 'Generate draft'}
                  </button>
                </div>
                {linkError && <p className="text-body-main mt-3 text-rose-500">{linkError}</p>}
                <p className="text-body-sub mt-3 text-[#64748B]">We try to pull item name, image, category, and price, then you review and fix anything before saving.</p>
              </div>
            )}
          </div>

          {filteredItems.length === 0 ? (
            <div className="text-body-main rounded-[28px] border border-dashed border-[#CBD5E1] bg-[#F8FBFF] px-5 py-5 text-[#64748B]">No items in this view yet.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredItems.map((item) => {
                const itemImages = itemImagesById.get(item.id) ?? []
                const coverImage = coverImageForItem(itemImages)
                return (
                  <button key={item.id} type="button" onClick={() => setSelectedItemId(item.id)} className="overflow-hidden rounded-[28px] border border-slate-200 bg-white text-left shadow-[0_18px_40px_-30px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-30px_rgba(15,23,42,0.45)]">
                    <div className="h-52 border-b border-slate-100 bg-slate-50">
                      {coverImage ? <img src={coverImage.cutout_public_url || coverImage.public_url} alt={item.item_name} className="h-full w-full object-contain" /> : <div className="text-body-main flex h-full items-center justify-center text-slate-400">No image yet</div>}
                    </div>
                    <div className="p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-label rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">{getGearCategoryLabel(item.category)}</span>
                        {showcaseItemIds.has(item.id) && <span className="text-label rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">In showcase</span>}
                      </div>
                      <h3 className="text-title-main mt-3 text-slate-900">{item.item_name}</h3>
                      <p className="text-body-sub mt-1 text-slate-500">{item.gear_type || item.current_status || readMetadataString(item.metadata, 'wishlist_status') || 'Open detail'}</p>
                      {item.showcase_note && <p className="text-body-main mt-2 text-slate-600">{item.showcase_note}</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
