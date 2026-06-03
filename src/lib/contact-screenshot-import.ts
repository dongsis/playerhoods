import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'
import type { ContactPlayerResolved } from '@/lib/api/roster'

type Client = SupabaseClient<Database>

export type ContactImportConfidence = 'high' | 'medium' | 'low'

export type ContactScreenshotUpload = {
  storage_path: string
  file_name: string
  mime_type?: string | null
}

export type ContactImportDuplicate = {
  guest_id: string
  display_name: string
  reason: string
}

export type ContactImportDraft = {
  id: string
  source_file_name: string
  source_label: string
  display_name: string
  phone: string
  email: string
  source_excerpt: string
  confidence: ContactImportConfidence
  missing_fields: string[]
  possible_duplicate: ContactImportDuplicate | null
  selected_by_default: boolean
}

export type ContactScreenshotImportCreatedContact = {
  guest_id: string
  display_name: string
  phone: string | null
  email: string | null
}

export type ContactScreenshotImportResult = {
  created: number
  skipped: number
  createdContacts: ContactScreenshotImportCreatedContact[]
}

type ModelCandidate = {
  display_name?: string
  phone?: string
  email?: string
  source_excerpt?: string
  confidence?: ContactImportConfidence
}

type ModelResponse = {
  candidates?: ModelCandidate[]
}

function makeDraftId(seed: string): string {
  return `${seed}-${Math.random().toString(36).slice(2, 8)}`
}

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
  if (digits.length === 11 && digits.startsWith('1')) {
    return `1${digits.slice(1)}`
  }
  return hasPlus ? `+${digits}` : digits
}

function normalizeName(value: string | null | undefined): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function sanitizePhone(value: string | null | undefined): string {
  const trimmed = cleanText(value)
  if (!trimmed) return ''
  return trimmed.replace(/\s+/g, ' ')
}

function sanitizeEmail(value: string | null | undefined): string {
  return normalizeEmail(value)
}

function sanitizeName(value: string | null | undefined): string {
  return cleanText(value)
}

function buildMissingFields(candidate: {
  display_name: string
  phone: string
  email: string
}): string[] {
  const missing: string[] = []
  if (!candidate.display_name) missing.push('Name missing')
  if (!candidate.phone && !candidate.email) missing.push('Phone or email required')
  return missing
}

function compareDuplicate(
  candidate: { display_name: string; phone: string; email: string },
  existing: ContactPlayerResolved,
): ContactImportDuplicate | null {
  const candidateEmail = normalizeEmail(candidate.email)
  const candidatePhone = normalizePhone(candidate.phone)
  const candidateName = normalizeName(candidate.display_name)

  const existingEmail = normalizeEmail(existing.email)
  const existingPhone = normalizePhone(existing.phone)
  const existingName = normalizeName(existing.display_name)

  if (candidateEmail && existingEmail && candidateEmail === existingEmail) {
    return {
      guest_id: existing.guest_id,
      display_name: existing.display_name,
      reason: 'Same email as an existing Contact Player',
    }
  }

  if (candidatePhone && existingPhone && candidatePhone === existingPhone) {
    return {
      guest_id: existing.guest_id,
      display_name: existing.display_name,
      reason: 'Same phone number as an existing Contact Player',
    }
  }

  if (candidateName && existingName && candidateName === existingName) {
    return {
      guest_id: existing.guest_id,
      display_name: existing.display_name,
      reason: 'Same name as an existing Contact Player',
    }
  }

  return null
}

function inferConfidence(candidate: {
  display_name: string
  phone: string
  email: string
  confidence?: ContactImportConfidence
}): ContactImportConfidence {
  if (candidate.confidence === 'high' || candidate.confidence === 'medium' || candidate.confidence === 'low') {
    return candidate.confidence
  }
  if (candidate.display_name && (candidate.phone || candidate.email)) return 'high'
  if (candidate.phone || candidate.email) return 'medium'
  return 'low'
}

function mergeByIdentity(candidates: ContactImportDraft[]): ContactImportDraft[] {
  const map = new Map<string, ContactImportDraft>()

  for (const candidate of candidates) {
    const key = [
      normalizeEmail(candidate.email) || '_',
      normalizePhone(candidate.phone) || '_',
      normalizeName(candidate.display_name) || '_',
    ].join('|')

    const existing = map.get(key)
    if (!existing) {
      map.set(key, candidate)
      continue
    }

    map.set(key, {
      ...existing,
      display_name: existing.display_name || candidate.display_name,
      phone: existing.phone || candidate.phone,
      email: existing.email || candidate.email,
      source_excerpt: existing.source_excerpt || candidate.source_excerpt,
      confidence: existing.confidence === 'high' || candidate.confidence !== 'high'
        ? existing.confidence
        : candidate.confidence,
      missing_fields: buildMissingFields({
        display_name: existing.display_name || candidate.display_name,
        phone: existing.phone || candidate.phone,
        email: existing.email || candidate.email,
      }),
      selected_by_default:
        existing.selected_by_default || candidate.selected_by_default,
      possible_duplicate: existing.possible_duplicate ?? candidate.possible_duplicate,
    })
  }

  return Array.from(map.values())
}

function extractOutputText(payload: Record<string, unknown>): string {
  const direct = typeof payload.output_text === 'string' ? payload.output_text : ''
  if (direct) return direct

  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content?: unknown[] }).content ?? [])
      : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const text =
        typeof (part as { text?: string }).text === 'string'
          ? (part as { text?: string }).text
          : typeof (part as { output_text?: string }).output_text === 'string'
            ? (part as { output_text?: string }).output_text
            : ''
      if (text) return text
    }
  }

  return ''
}

function parseJsonResponse(raw: string): ModelResponse {
  const cleaned = raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  const parsed = JSON.parse(cleaned) as ModelResponse
  return parsed
}

async function parseImageWithVisionModel(
  fileName: string,
  mimeType: string,
  base64Image: string,
): Promise<ModelCandidate[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured for screenshot parsing.')
  }

  const prompt = [
    'Extract contact candidates from this screenshot.',
    'It may be a WhatsApp group info screenshot, a contact list, or another simple list.',
    'Identify likely person records and group adjacent lines that belong to the same contact.',
    'For each candidate, return:',
    '- display_name',
    '- phone',
    '- email',
    '- source_excerpt',
    '- confidence (high, medium, or low)',
    'Rules:',
    '- Return only likely human contacts, not section headers or UI labels.',
    '- Use empty strings for missing phone/email.',
    '- Prefer one structured candidate per person.',
    '- Do not invent contact details.',
    '- Return strict JSON only in the shape {"candidates":[...]} with no markdown.',
    `Source file: ${fileName}`,
  ].join('\n')

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1-mini',
      max_output_tokens: 1200,
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: prompt },
            {
              type: 'input_image',
              image_url: `data:${mimeType};base64,${base64Image}`,
            },
          ],
        },
      ],
    }),
  })

  const payload = (await response.json()) as Record<string, unknown>
  if (!response.ok) {
    const message =
      typeof payload.error === 'object' && payload.error && 'message' in payload.error
        ? String((payload.error as { message?: unknown }).message ?? 'OpenAI request failed')
        : 'OpenAI request failed'
    throw new Error(message)
  }

  const outputText = extractOutputText(payload)
  if (!outputText) {
    return []
  }

  const parsed = parseJsonResponse(outputText)
  return Array.isArray(parsed.candidates) ? parsed.candidates : []
}

export async function parseContactScreenshotUploads(
  supabase: Client,
  uploads: ContactScreenshotUpload[],
  existingContacts: ContactPlayerResolved[],
): Promise<ContactImportDraft[]> {
  const drafts: ContactImportDraft[] = []

  try {
    for (const upload of uploads) {
      const { data, error } = await supabase.storage.from('contact-imports').download(upload.storage_path)
      if (error) throw error

      const mimeType = upload.mime_type?.trim() || data.type || 'image/jpeg'
      const buffer = Buffer.from(await data.arrayBuffer())
      const base64Image = buffer.toString('base64')
      const modelCandidates = await parseImageWithVisionModel(upload.file_name, mimeType, base64Image)

      for (const candidate of modelCandidates) {
        const draft = {
          id: makeDraftId(upload.file_name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()),
          source_file_name: upload.file_name,
          source_label: `Imported from ${upload.file_name}`,
          display_name: sanitizeName(candidate.display_name),
          phone: sanitizePhone(candidate.phone),
          email: sanitizeEmail(candidate.email),
          source_excerpt: cleanText(candidate.source_excerpt),
          confidence: inferConfidence({
            display_name: sanitizeName(candidate.display_name),
            phone: sanitizePhone(candidate.phone),
            email: sanitizeEmail(candidate.email),
            confidence: candidate.confidence,
          }),
          missing_fields: [] as string[],
          possible_duplicate: null as ContactImportDuplicate | null,
          selected_by_default: false,
        }

        draft.missing_fields = buildMissingFields(draft)
        draft.possible_duplicate = existingContacts
          .map((existing) => compareDuplicate(draft, existing))
          .find(Boolean) ?? null
        draft.selected_by_default = draft.missing_fields.length === 0

        if (draft.display_name || draft.phone || draft.email) {
          drafts.push(draft)
        }
      }
    }

    return mergeByIdentity(drafts)
  } finally {
    if (uploads.length > 0) {
      await supabase.storage.from('contact-imports').remove(uploads.map((upload) => upload.storage_path))
    }
  }
}
