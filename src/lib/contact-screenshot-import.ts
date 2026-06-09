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

type ModelCandidate = {
  name: string
  phone: string
  email: string
  confidence: ContactImportConfidence
  sourceNotes: string
}

type ModelResponse = {
  contacts: ModelCandidate[]
}

type SmartImportDiagnosticCategory =
  | 'missing_openai_key'
  | 'storage_download_error'
  | 'openai_401'
  | 'openai_400'
  | 'openai_429'
  | 'openai_5xx'
  | 'openai_network_error'
  | 'openai_incomplete'
  | 'openai_refusal'
  | 'schema_mismatch'
  | 'json_parse_error'
  | 'no_contacts_detected'
  | 'unknown_import_error'

type SmartImportDiagnosticStage =
  | 'configuration'
  | 'storage_download'
  | 'openai_request'
  | 'openai_response'
  | 'response_parsing'
  | 'model_output'
  | 'import_flow'

type SmartImportDiagnostic = {
  category: SmartImportDiagnosticCategory
  stage: SmartImportDiagnosticStage
  httpStatus?: number
  errorName?: string
}

const CONTACT_EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['contacts'],
  properties: {
    contacts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'phone', 'email', 'confidence', 'sourceNotes'],
        properties: {
          name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          sourceNotes: { type: 'string' },
        },
      },
    },
  },
} as const

class ContactScreenshotImportError extends Error {
  diagnosticLogged = false

  constructor(message: string) {
    super(message)
    this.name = 'ContactScreenshotImportError'
  }
}

function safeErrorName(error: unknown): string | undefined {
  const rawName =
    error && typeof error === 'object' && 'name' in error && typeof (error as { name?: unknown }).name === 'string'
      ? (error as { name: string }).name
      : error && typeof error === 'object' && error.constructor?.name
        ? error.constructor.name
        : ''
  const redactedName = rawName
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'EmailRedacted')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, 'PhoneRedacted')
  const name = redactedName.replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 80)
  return name || undefined
}

function logSmartImportDiagnostic(diagnostic: SmartImportDiagnostic) {
  const metadata: Record<string, string | number> = {
    category: diagnostic.category,
    stage: diagnostic.stage,
  }
  if (typeof diagnostic.httpStatus === 'number') metadata.httpStatus = diagnostic.httpStatus
  if (diagnostic.errorName) metadata.errorName = diagnostic.errorName
  console.info('smart_import_diagnostic', metadata)
}

function smartImportError(
  message: string,
  diagnostic?: SmartImportDiagnostic,
): ContactScreenshotImportError {
  const error = new ContactScreenshotImportError(message)
  if (diagnostic) {
    logSmartImportDiagnostic(diagnostic)
    error.diagnosticLogged = true
  }
  return error
}

function logUnknownImportError(error: unknown) {
  if (error instanceof ContactScreenshotImportError && error.diagnosticLogged) return
  logSmartImportDiagnostic({
    category: 'unknown_import_error',
    stage: 'import_flow',
    errorName: safeErrorName(error),
  })
}

function openAiHttpCategory(status: number): SmartImportDiagnosticCategory {
  if (status === 400) return 'openai_400'
  if (status === 401 || status === 403) return 'openai_401'
  if (status === 429) return 'openai_429'
  if (status >= 500) return 'openai_5xx'
  return 'unknown_import_error'
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

function sanitizeSourceNotes(value: string | null | undefined): string {
  return cleanText(value)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[phone]')
    .slice(0, 160)
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

function responseHasRefusal(payload: Record<string, unknown>): boolean {
  const output = Array.isArray(payload.output) ? payload.output : []
  for (const item of output) {
    if (!item || typeof item !== 'object') continue
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? ((item as { content?: unknown[] }).content ?? [])
      : []
    for (const part of content) {
      if (!part || typeof part !== 'object') continue
      const type = typeof (part as { type?: unknown }).type === 'string'
        ? (part as { type: string }).type
        : ''
      if (type === 'refusal' || 'refusal' in part) return true
    }
  }
  return false
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

function isConfidence(value: unknown): value is ContactImportConfidence {
  return value === 'high' || value === 'medium' || value === 'low'
}

function parseStructuredResponse(raw: string): ModelCandidate[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw smartImportError(
      'Smart Import could not understand the screenshot response. Try a clearer crop, paste another screenshot, or add the contact manually.',
      {
        category: 'json_parse_error',
        stage: 'response_parsing',
        errorName: safeErrorName(error),
      },
    )
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw smartImportError(
      'Smart Import could not understand the screenshot response. Try a clearer crop, paste another screenshot, or add the contact manually.',
      {
        category: 'schema_mismatch',
        stage: 'response_parsing',
      },
    )
  }

  const contacts = (parsed as Partial<ModelResponse>).contacts
  if (!Array.isArray(contacts)) {
    throw smartImportError(
      'Smart Import could not understand the screenshot response. Try a clearer crop, paste another screenshot, or add the contact manually.',
      {
        category: 'schema_mismatch',
        stage: 'response_parsing',
      },
    )
  }

  return contacts.map((contact) => {
    if (!contact || typeof contact !== 'object' || Array.isArray(contact)) {
      throw smartImportError(
        'Smart Import could not understand one of the detected contacts. Try a clearer crop, paste another screenshot, or add the contact manually.',
        {
          category: 'schema_mismatch',
          stage: 'response_parsing',
        },
      )
    }

    const record = contact as Record<string, unknown>
    if (
      typeof record.name !== 'string'
      || typeof record.phone !== 'string'
      || typeof record.email !== 'string'
      || typeof record.sourceNotes !== 'string'
      || !isConfidence(record.confidence)
    ) {
      throw smartImportError(
        'Smart Import could not understand one of the detected contacts. Try a clearer crop, paste another screenshot, or add the contact manually.',
        {
          category: 'schema_mismatch',
          stage: 'response_parsing',
        },
      )
    }

    return {
      name: record.name,
      phone: record.phone,
      email: record.email,
      confidence: record.confidence,
      sourceNotes: sanitizeSourceNotes(record.sourceNotes),
    }
  })
}

async function parseImageWithVisionModel(
  fileName: string,
  mimeType: string,
  base64Image: string,
): Promise<ModelCandidate[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    throw smartImportError('Smart Import is not fully configured yet. Add the contact manually for now.', {
      category: 'missing_openai_key',
      stage: 'configuration',
    })
  }

  const prompt = [
    'Extract contact candidates from this screenshot or uploaded image.',
    'The image may be an iOS Contacts detail screen, an Android Contacts detail screen, a messaging profile, a contact list, a group info screen, or another contact-like screenshot.',
    'Support screenshots where a single name and phone number are visible in normal app UI, even when the content is not a table, spreadsheet, or CSV.',
    'Identify likely person records and group adjacent lines that belong to the same contact.',
    'For each contact, return name, phone, email, confidence, and a short debugging-safe sourceNotes explanation.',
    'Rules:',
    '- Return only likely human contacts, not section headers or UI labels.',
    '- Use empty strings for missing phone/email.',
    '- A contact is useful if it has a name plus phone or email, or a very clear phone/email with nearby person context.',
    '- Prefer one structured candidate per person.',
    '- Do not invent contact details.',
    '- If no likely contacts are visible, return an empty contacts array.',
    '- Keep sourceNotes short and do not include full phone numbers, emails, or raw OCR text.',
    `Source file: ${fileName}`,
  ].join('\n')

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        max_output_tokens: 1200,
        text: {
          format: {
            type: 'json_schema',
            name: 'contact_screenshot_import',
            strict: true,
            schema: CONTACT_EXTRACTION_SCHEMA,
          },
        },
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              {
                type: 'input_image',
                detail: 'high',
                image_url: `data:${mimeType};base64,${base64Image}`,
              },
            ],
          },
        ],
      }),
    })
  } catch (error) {
    throw smartImportError(
      'Smart Import could not reach the screenshot reader. Try again in a moment, or add the contact manually.',
      {
        category: 'openai_network_error',
        stage: 'openai_request',
        errorName: safeErrorName(error),
      },
    )
  }

  const payload = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) {
    const category = openAiHttpCategory(response.status)
    if (response.status === 401 || response.status === 403) {
      throw smartImportError('Smart Import is not fully configured yet. Add the contact manually for now.', {
        category,
        stage: 'openai_response',
        httpStatus: response.status,
      })
    }
    throw smartImportError(
      'Smart Import could not read that screenshot right now. Try again in a moment, use a clearer crop, or add the contact manually.',
      {
        category,
        stage: 'openai_response',
        httpStatus: response.status,
      },
    )
  }

  const status = typeof payload.status === 'string' ? payload.status : ''
  if (status && status !== 'completed') {
    throw smartImportError(
      status === 'incomplete'
        ? 'Smart Import could not finish reading that screenshot. Try a clearer crop, paste another screenshot, or add the contact manually.'
        : 'Smart Import could not read that screenshot right now. Try again in a moment, use a clearer crop, or add the contact manually.',
      {
        category: status === 'incomplete' ? 'openai_incomplete' : 'unknown_import_error',
        stage: 'openai_response',
      },
    )
  }

  if (responseHasRefusal(payload)) {
    throw smartImportError(
      'Smart Import could not process that image. Try a clearer contact screenshot, or add the contact manually.',
      {
        category: 'openai_refusal',
        stage: 'openai_response',
      },
    )
  }

  const outputText = extractOutputText(payload)
  if (!outputText) {
    throw smartImportError(
      'Smart Import could not understand the screenshot response. Try a clearer crop, paste another screenshot, or add the contact manually.',
      {
        category: 'schema_mismatch',
        stage: 'model_output',
      },
    )
  }

  const candidates = parseStructuredResponse(outputText)
  if (candidates.length === 0) {
    logSmartImportDiagnostic({
      category: 'no_contacts_detected',
      stage: 'model_output',
    })
  }

  return candidates
}

export async function parseContactScreenshotUploads(
  supabase: Client,
  uploads: ContactScreenshotUpload[],
  _existingContacts: ContactPlayerResolved[],
): Promise<ContactImportDraft[]> {
  if (uploads.length > 0) {
    await supabase.storage.from('contact-imports').remove(uploads.map((upload) => upload.storage_path))
  }

  throw smartImportError('Image Smart Import is no longer available. Paste contact text instead.')
}
