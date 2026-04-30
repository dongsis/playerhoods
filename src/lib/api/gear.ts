import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Database,
  GearCategory,
  GearCollectionType,
  GearImage,
  GearImageKind,
  GearItem,
  GearShowcaseEntry,
  GearShowcaseSourceType,
  GearStringJob,
  Json,
} from '@/lib/types/database'

type Client = SupabaseClient<Database>

export type GearItemInput = {
  collection_type: GearCollectionType
  category: GearCategory
  item_name: string
  gear_type?: string | null
  current_status?: string | null
  purchase_date?: string | null
  purchase_price?: number | null
  source_link?: string | null
  source_price?: number | null
  bought_from?: string | null
  nickname?: string | null
  notes?: string | null
  metadata?: Json
  recognition_confidence?: string | null
  recognition_detected_text?: string[]
  visible_in_showcase?: boolean
  showcase_note?: string | null
  archived_at?: string | null
}

export type GearImageInput = {
  gear_item_id?: string | null
  image_kind?: GearImageKind
  storage_path: string
  public_url: string
  cutout_storage_path?: string | null
  cutout_public_url?: string | null
  caption?: string | null
  sort_order?: number
  is_cover?: boolean
}

export type GearStringJobInput = {
  gear_item_id: string
  strung_at: string
  string_name?: string | null
  string_brand?: string | null
  string_type?: string | null
  string_shape?: string | null
  gauge?: string | null
  tension_mains?: number | null
  tension_crosses?: number | null
  strung_by?: string | null
  cost?: number | null
  first_impression?: string | null
  follow_up_feel?: string | null
  ended_at?: string | null
  ended_reason?: string | null
}

export type GearShowcaseEntryInput = {
  source_type: GearShowcaseSourceType
  gear_item_id?: string | null
  gear_image_id?: string | null
  is_visible?: boolean
  pinned?: boolean
  is_cover?: boolean
  sort_order?: number
  display_note?: string | null
}

function normalizeItemInput(input: GearItemInput) {
  return {
    collection_type: input.collection_type,
    category: input.category,
    item_name: input.item_name.trim(),
    gear_type: input.gear_type?.trim() || null,
    current_status: input.current_status?.trim() || null,
    purchase_date: input.purchase_date || null,
    purchase_price: input.purchase_price ?? null,
    source_link: input.source_link?.trim() || null,
    source_price: input.source_price ?? null,
    bought_from: input.bought_from?.trim() || null,
    nickname: input.nickname?.trim() || null,
    notes: input.notes?.trim() || null,
    metadata: input.metadata ?? {},
    recognition_confidence: input.recognition_confidence?.trim() || null,
    recognition_detected_text: input.recognition_detected_text ?? [],
    visible_in_showcase: input.visible_in_showcase ?? false,
    showcase_note: input.showcase_note?.trim() || null,
    archived_at: input.archived_at ?? null,
  }
}

function normalizePartialItemInput(input: Partial<GearItemInput>) {
  const payload: Record<string, unknown> = {}
  if (input.collection_type !== undefined) payload.collection_type = input.collection_type
  if (input.category !== undefined) payload.category = input.category
  if (input.item_name !== undefined) payload.item_name = input.item_name.trim()
  if (input.gear_type !== undefined) payload.gear_type = input.gear_type?.trim() || null
  if (input.current_status !== undefined) payload.current_status = input.current_status?.trim() || null
  if (input.purchase_date !== undefined) payload.purchase_date = input.purchase_date || null
  if (input.purchase_price !== undefined) payload.purchase_price = input.purchase_price ?? null
  if (input.source_link !== undefined) payload.source_link = input.source_link?.trim() || null
  if (input.source_price !== undefined) payload.source_price = input.source_price ?? null
  if (input.bought_from !== undefined) payload.bought_from = input.bought_from?.trim() || null
  if (input.nickname !== undefined) payload.nickname = input.nickname?.trim() || null
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null
  if (input.metadata !== undefined) payload.metadata = input.metadata ?? {}
  if (input.recognition_confidence !== undefined) payload.recognition_confidence = input.recognition_confidence?.trim() || null
  if (input.recognition_detected_text !== undefined) payload.recognition_detected_text = input.recognition_detected_text ?? []
  if (input.visible_in_showcase !== undefined) payload.visible_in_showcase = input.visible_in_showcase
  if (input.showcase_note !== undefined) payload.showcase_note = input.showcase_note?.trim() || null
  if (input.archived_at !== undefined) payload.archived_at = input.archived_at ?? null
  return payload
}

export async function listMyGearItems(supabase: Client, userId: string): Promise<GearItem[]> {
  const { data, error } = await supabase
    .from('gear_items')
    .select('*')
    .eq('owner_user_id', userId)
    .order('archived_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as GearItem[]
}

export async function listMyGearImages(supabase: Client, userId: string): Promise<GearImage[]> {
  const { data, error } = await supabase
    .from('gear_images')
    .select('*')
    .eq('owner_user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as GearImage[]
}

export async function listMyGearStringJobs(supabase: Client, userId: string): Promise<GearStringJob[]> {
  const { data, error } = await supabase
    .from('gear_string_jobs')
    .select('*')
    .eq('owner_user_id', userId)
    .order('strung_at', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as GearStringJob[]
}

export async function listMyGearShowcaseEntries(supabase: Client, userId: string): Promise<GearShowcaseEntry[]> {
  const { data, error } = await supabase
    .from('gear_showcase_entries')
    .select('*')
    .eq('owner_user_id', userId)
    .order('pinned', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as GearShowcaseEntry[]
}

export async function createGearItem(
  supabase: Client,
  userId: string,
  input: GearItemInput,
): Promise<GearItem> {
  const { data, error } = await supabase
    .from('gear_items')
    .insert({
      owner_user_id: userId,
      ...normalizeItemInput(input),
    })
    .select('*')
    .single()

  if (error) throw error
  return data as GearItem
}

export async function updateGearItem(
  supabase: Client,
  itemId: string,
  input: Partial<GearItemInput>,
): Promise<GearItem> {
  const { data, error } = await supabase
    .from('gear_items')
    .update(normalizePartialItemInput(input))
    .eq('id', itemId)
    .select('*')
    .single()

  if (error) throw error
  return data as GearItem
}

export async function deleteGearItem(supabase: Client, itemId: string): Promise<void> {
  const { error } = await supabase.from('gear_items').delete().eq('id', itemId)
  if (error) throw error
}

export async function archiveGearItem(supabase: Client, itemId: string, archived: boolean): Promise<GearItem> {
  const { data, error } = await supabase
    .from('gear_items')
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq('id', itemId)
    .select('*')
    .single()

  if (error) throw error
  return data as GearItem
}

export async function moveWishlistItemToOwned(supabase: Client, itemId: string): Promise<GearItem> {
  const { data, error } = await supabase
    .from('gear_items')
    .update({
      collection_type: 'owned',
      archived_at: null,
    })
    .eq('id', itemId)
    .select('*')
    .single()

  if (error) throw error
  return data as GearItem
}

export async function createGearImage(
  supabase: Client,
  userId: string,
  input: GearImageInput,
): Promise<GearImage> {
  const { data, error } = await supabase
    .from('gear_images')
    .insert({
      owner_user_id: userId,
      gear_item_id: input.gear_item_id ?? null,
      image_kind: input.image_kind ?? (input.gear_item_id ? 'item' : 'setup_photo'),
      storage_path: input.storage_path,
      public_url: input.public_url,
      cutout_storage_path: input.cutout_storage_path ?? null,
      cutout_public_url: input.cutout_public_url ?? null,
      caption: input.caption?.trim() || null,
      sort_order: input.sort_order ?? 0,
      is_cover: input.is_cover ?? false,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as GearImage
}

export async function updateGearImage(
  supabase: Client,
  imageId: string,
  input: Partial<GearImageInput>,
): Promise<GearImage> {
  const { data, error } = await supabase
    .from('gear_images')
    .update({
      gear_item_id: input.gear_item_id,
      image_kind: input.image_kind,
      storage_path: input.storage_path,
      public_url: input.public_url,
      cutout_storage_path: input.cutout_storage_path,
      cutout_public_url: input.cutout_public_url,
      caption: input.caption?.trim() || null,
      sort_order: input.sort_order,
      is_cover: input.is_cover,
    })
    .eq('id', imageId)
    .select('*')
    .single()

  if (error) throw error
  return data as GearImage
}

export async function deleteGearImage(supabase: Client, imageId: string): Promise<void> {
  const { error } = await supabase.from('gear_images').delete().eq('id', imageId)
  if (error) throw error
}

export async function createGearStringJob(
  supabase: Client,
  userId: string,
  input: GearStringJobInput,
): Promise<GearStringJob> {
  const { data, error } = await supabase
    .from('gear_string_jobs')
    .insert({
      owner_user_id: userId,
      gear_item_id: input.gear_item_id,
      strung_at: input.strung_at,
      string_name: input.string_name?.trim() || null,
      string_brand: input.string_brand?.trim() || null,
      string_type: input.string_type?.trim() || null,
      string_shape: input.string_shape?.trim() || null,
      gauge: input.gauge?.trim() || null,
      tension_mains: input.tension_mains ?? null,
      tension_crosses: input.tension_crosses ?? null,
      strung_by: input.strung_by?.trim() || null,
      cost: input.cost ?? null,
      first_impression: input.first_impression?.trim() || null,
      follow_up_feel: input.follow_up_feel?.trim() || null,
      ended_at: input.ended_at || null,
      ended_reason: input.ended_reason?.trim() || null,
    })
    .select('*')
    .single()

  if (error) throw error
  return data as GearStringJob
}

export async function updateGearStringJob(
  supabase: Client,
  jobId: string,
  input: Partial<GearStringJobInput>,
): Promise<GearStringJob> {
  const { data, error } = await supabase
    .from('gear_string_jobs')
    .update({
      gear_item_id: input.gear_item_id,
      strung_at: input.strung_at,
      string_name: input.string_name?.trim() || null,
      string_brand: input.string_brand?.trim() || null,
      string_type: input.string_type?.trim() || null,
      string_shape: input.string_shape?.trim() || null,
      gauge: input.gauge?.trim() || null,
      tension_mains: input.tension_mains ?? null,
      tension_crosses: input.tension_crosses ?? null,
      strung_by: input.strung_by?.trim() || null,
      cost: input.cost ?? null,
      first_impression: input.first_impression?.trim() || null,
      follow_up_feel: input.follow_up_feel?.trim() || null,
      ended_at: input.ended_at || null,
      ended_reason: input.ended_reason?.trim() || null,
    })
    .eq('id', jobId)
    .select('*')
    .single()

  if (error) throw error
  return data as GearStringJob
}

export async function deleteGearStringJob(supabase: Client, jobId: string): Promise<void> {
  const { error } = await supabase.from('gear_string_jobs').delete().eq('id', jobId)
  if (error) throw error
}

export async function upsertGearShowcaseEntry(
  supabase: Client,
  userId: string,
  input: GearShowcaseEntryInput,
): Promise<GearShowcaseEntry> {
  const targetFilter = input.gear_item_id
    ? { gear_item_id: input.gear_item_id, gear_image_id: null }
    : { gear_item_id: null, gear_image_id: input.gear_image_id ?? null }

  const { data: existing, error: existingError } = await supabase
    .from('gear_showcase_entries')
    .select('*')
    .eq('owner_user_id', userId)
    .match(targetFilter)
    .maybeSingle()

  if (existingError) throw existingError

  const payload = {
    owner_user_id: userId,
    source_type: input.source_type,
    gear_item_id: input.gear_item_id ?? null,
    gear_image_id: input.gear_image_id ?? null,
    is_visible: input.is_visible ?? true,
    pinned: input.pinned ?? false,
    is_cover: input.is_cover ?? false,
    sort_order: input.sort_order ?? 0,
    display_note: input.display_note?.trim() || null,
  }

  const query = existing
    ? supabase.from('gear_showcase_entries').update(payload).eq('id', existing.id)
    : supabase.from('gear_showcase_entries').insert(payload)

  const { data, error } = await query.select('*').single()
  if (error) throw error
  return data as GearShowcaseEntry
}

export async function deleteGearShowcaseEntry(supabase: Client, entryId: string): Promise<void> {
  const { error } = await supabase.from('gear_showcase_entries').delete().eq('id', entryId)
  if (error) throw error
}
