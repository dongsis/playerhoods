import { TENNIS_RACKET_OPTIONS } from '@/lib/tennis-racket-options'
import type { GearCategory, Json } from '@/lib/types/database'

export type GearLinkFieldConfidence = 'high' | 'medium' | 'low'

export type GearLinkConfidenceField =
  | 'item_name'
  | 'category'
  | 'brand'
  | 'price'
  | 'gear_type'
  | 'image'
  | 'head_size'
  | 'string_pattern'
  | 'length'
  | 'grip_size'

export type GearLinkImportDraft = {
  item_name: string
  category: GearCategory
  gear_type: string | null
  source_link: string
  source_price: number | null
  image_url: string | null
  brand: string | null
  head_size: string | null
  string_pattern: string | null
  length: string | null
  grip_size: string | null
  metadata: Json
  detected_fields: string[]
  confidence: Partial<Record<GearLinkConfidenceField, GearLinkFieldConfidence>>
  parser_label: string
  notes: string[]
}

type Candidate<T> = {
  value: T
  source: string
  confidence: GearLinkFieldConfidence
}

type ExtractedPageData = {
  parserLabel: string
  titleCandidates: Candidate<string>[]
  brandCandidates: Candidate<string>[]
  priceCandidates: Candidate<number>[]
  imageCandidates: Candidate<string>[]
  categoryHints: Candidate<string>[]
  descriptionCandidates: Candidate<string>[]
  specCandidates: Partial<Record<'head_size' | 'string_pattern' | 'length' | 'grip_size', Candidate<string>[]>>
}

const BRANDS = ['Wilson', 'Yonex', 'Babolat', 'HEAD', 'Tecnifibre', 'Dunlop', 'Diadem', 'Volkl', 'Prince', 'Solinco'] as const
const COLOR_WORDS = ['black', 'white', 'blue', 'red', 'green', 'yellow', 'orange', 'pink', 'silver', 'gold', 'graphite', 'navy', 'teal', 'lime', 'purple', 'grey', 'gray', 'aqua', 'night', 'scarlet']
const MARKETPLACE_NOISE_PATTERNS = [
  /\b(?:buy|shop|order|discover|sale)\b/gi,
  /\b(?:free shipping|free delivery|fast shipping|best price|low prices?|lowest prices?)\b/gi,
  /\b(?:official site|official store|online(?:\s+at)?(?:\s+low\s+prices?)?)\b/gi,
  /\b(?:new arrival|in stock|instock|available now)\b/gi,
  /\b(?:amazon|walmart|ebay|tennis warehouse|tennis express|racquetguys|racquet guys|do it tennis)\b/gi,
]
const STORE_SUFFIX_HINTS = /\b(?:store|shop|official|warehouse|express|marketplace|india|canada|usa|uk)\b/i

function cleanText(value: string | null | undefined): string {
  return decodeHtmlEntities(value ?? '').replace(/\s+/g, ' ').replace(/\u00a0/g, ' ').trim()
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 10)))
}

function htmlToText(html: string): string {
  return cleanText(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '))
}

function normalizeForMatch(value: string): string {
  return cleanText(value).toLowerCase().replace(/racquet/g, 'racket').replace(/(\d{1,2})\s*[xX]\s*(\d{1,2})/g, '$1x$2').replace(/[^a-z0-9+]+/g, ' ').trim()
}

function tokenizeForMatch(value: string): string[] {
  return normalizeForMatch(value).split(' ').filter(Boolean)
}

function pushCandidate<T>(target: Candidate<T>[], value: T | null | undefined, source: string, confidence: GearLinkFieldConfidence) {
  if (value == null) return
  if (typeof value === 'string' && !cleanText(value)) return
  target.push({ value, source, confidence } as Candidate<T>)
}

function uniqueCandidates<T>(candidates: Candidate<T>[]): Candidate<T>[] {
  const seen = new Set<string>()
  const result: Candidate<T>[] = []
  for (const candidate of candidates) {
    const key = typeof candidate.value === 'string' ? cleanText(candidate.value) : JSON.stringify(candidate.value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(candidate)
  }
  return result
}

function pickBestCandidate<T>(candidates: Candidate<T>[]): Candidate<T> | null {
  return uniqueCandidates(candidates)[0] ?? null
}

function extractMetaContent(html: string, attribute: 'name' | 'property', value: string): string {
  const patterns = [
    new RegExp(`<meta[^>]+${attribute}=["']${escapeRegExp(value)}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escapeRegExp(value)}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1]
    if (match) return cleanText(match)
  }
  return ''
}

function extractTitleTag(html: string): string {
  return cleanText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1])
}

function extractFirstElementText(html: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = html.match(pattern)?.[1]
    if (match) {
      const text = cleanText(match.replace(/<[^>]+>/g, ' '))
      if (text) return text
    }
  }
  return ''
}

function extractAllElementTexts(html: string, patterns: RegExp[]): string[] {
  const values: string[] = []
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const text = cleanText(match[1]?.replace(/<[^>]+>/g, ' '))
      if (text) values.push(text)
    }
  }
  return Array.from(new Set(values))
}

function extractAmazonImage(html: string): string | null {
  const oldHires = cleanText(html.match(/data-old-hires=["']([^"']+)["']/i)?.[1])
  if (oldHires) return oldHires
  const dynamicImage = html.match(/data-a-dynamic-image=["']({[^"']+})["']/i)?.[1]
  if (!dynamicImage) return null
  try {
    const parsed = JSON.parse(decodeHtmlEntities(dynamicImage)) as Record<string, unknown>
    return cleanText(Object.keys(parsed)[0]) || null
  } catch {
    return null
  }
}

function extractJsonLdNodes(html: string): unknown[] {
  const nodes: unknown[] = []
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const raw = cleanText(match[1])
    if (!raw) continue
    try {
      nodes.push(JSON.parse(raw) as unknown)
    } catch {
      continue
    }
  }
  return nodes
}

function flattenJsonLdNodes(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== 'object') return []
  if (Array.isArray(value)) return value.flatMap(flattenJsonLdNodes)
  const record = value as Record<string, unknown>
  const graph = Array.isArray(record['@graph']) ? flattenJsonLdNodes(record['@graph']) : []
  return [record, ...graph]
}

function firstString(value: unknown): string | null {
  if (typeof value === 'string') return cleanText(value) || null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstString(item)
      if (found) return found
    }
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return firstString(record.name ?? record.value ?? record.url)
  }
  return null
}

function parseStructuredProducts(html: string): ExtractedPageData {
  const extracted: ExtractedPageData = {
    parserLabel: 'Structured product metadata',
    titleCandidates: [],
    brandCandidates: [],
    priceCandidates: [],
    imageCandidates: [],
    categoryHints: [],
    descriptionCandidates: [],
    specCandidates: {},
  }

  for (const root of extractJsonLdNodes(html)) {
    for (const node of flattenJsonLdNodes(root)) {
      const typeValue = node['@type']
      const types = Array.isArray(typeValue) ? typeValue : [typeValue]
      const isProduct = types.some((type) => typeof type === 'string' && type.toLowerCase() === 'product')
      if (!isProduct) continue

      pushCandidate(extracted.titleCandidates, firstString(node.name), 'jsonld:name', 'high')
      pushCandidate(extracted.brandCandidates, firstString(node.brand), 'jsonld:brand', 'high')
      pushCandidate(extracted.descriptionCandidates, firstString(node.description), 'jsonld:description', 'medium')
      pushCandidate(extracted.categoryHints, firstString(node.category), 'jsonld:category', 'medium')
      pushCandidate(extracted.imageCandidates, firstString(node.image), 'jsonld:image', 'high')

      const offers = Array.isArray(node.offers) ? node.offers : [node.offers]
      for (const offer of offers) {
        if (!offer || typeof offer !== 'object') continue
        const priceValue = (offer as Record<string, unknown>).price
        const parsedPrice = typeof priceValue === 'number'
          ? priceValue
          : typeof priceValue === 'string'
            ? parsePrice(priceValue)
            : null
        pushCandidate(extracted.priceCandidates, parsedPrice, 'jsonld:price', 'high')
      }

      const additionalProperties = Array.isArray(node.additionalProperty)
        ? node.additionalProperty
        : Array.isArray(node.additionalProperties)
          ? node.additionalProperties
          : []
      for (const property of additionalProperties) {
        if (!property || typeof property !== 'object') continue
        const record = property as Record<string, unknown>
        const label = normalizeForMatch(firstString(record.name) ?? '')
        const value = firstString(record.value)
        if (!label || !value) continue
        pushSpecCandidate(extracted.specCandidates, label, value, 'jsonld:additionalProperty', 'medium')
      }
    }
  }

  return extracted
}

function pushSpecCandidate(
  specCandidates: ExtractedPageData['specCandidates'],
  normalizedLabel: string,
  value: string,
  source: string,
  confidence: GearLinkFieldConfidence,
) {
  const mapping: Array<[keyof NonNullable<ExtractedPageData['specCandidates']>, RegExp]> = [
    ['head_size', /\bhead size\b/],
    ['string_pattern', /\bstring pattern\b/],
    ['length', /\blength\b/],
    ['grip_size', /\bgrip size\b/],
  ]
  for (const [field, pattern] of mapping) {
    if (!pattern.test(normalizedLabel)) continue
    const list = specCandidates[field] ?? []
    list.push({ value, source, confidence })
    specCandidates[field] = list
  }
}

function parseAmazonPage(hostname: string, html: string): ExtractedPageData | null {
  if (!/amazon\./i.test(hostname)) return null

  const title = extractFirstElementText(html, [
    /<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ])
  const brand = extractFirstElementText(html, [/<a[^>]+id=["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i]).replace(/^visit the /i, '').replace(/\s+store$/i, '')
  const priceText = extractFirstElementText(html, [
    /<span[^>]+class=["'][^"']*a-price[^"']*["'][^>]*>[\s\S]*?<span[^>]+class=["'][^"']*a-offscreen[^"']*["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]+id=["']priceblock_ourprice["'][^>]*>([\s\S]*?)<\/span>/i,
    /<span[^>]+id=["']priceblock_dealprice["'][^>]*>([\s\S]*?)<\/span>/i,
  ])
  const image = extractAmazonImage(html)

  return {
    parserLabel: 'Amazon product parser',
    titleCandidates: title ? [{ value: title, source: 'amazon:productTitle', confidence: 'high' }] : [],
    brandCandidates: brand ? [{ value: brand, source: 'amazon:brand', confidence: 'high' }] : [],
    priceCandidates: parsePrice(priceText) != null ? [{ value: parsePrice(priceText) as number, source: 'amazon:price', confidence: 'medium' }] : [],
    imageCandidates: image ? [{ value: image, source: 'amazon:image', confidence: 'medium' }] : [],
    categoryHints: [],
    descriptionCandidates: [],
    specCandidates: {},
  }
}

function parseBrandSitePage(hostname: string, html: string): ExtractedPageData | null {
  if (!/(wilson|yonex|babolat|head|tecnifibre|dunlop)/i.test(hostname)) return null
  const title = extractFirstElementText(html, [
    /<h1[^>]+class=["'][^"']*(?:product|pdp|page)[^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ])
  const brand = detectBrandFromText(`${hostname} ${title}`) ?? null
  const image = extractMetaContent(html, 'property', 'og:image')

  return {
    parserLabel: 'Brand site parser',
    titleCandidates: title ? [{ value: title, source: 'brand:h1', confidence: 'high' }] : [],
    brandCandidates: brand ? [{ value: brand, source: 'brand:domain', confidence: 'high' }] : [],
    priceCandidates: [],
    imageCandidates: image ? [{ value: image, source: 'brand:og-image', confidence: 'medium' }] : [],
    categoryHints: [],
    descriptionCandidates: [],
    specCandidates: {},
  }
}

function parseTennisRetailerPage(hostname: string, html: string): ExtractedPageData | null {
  if (!/(tennis-warehouse|tenniswarehouse|tennisexpress|racquetguys|doittennis)/i.test(hostname)) return null
  const title = extractFirstElementText(html, [
    /<h1[^>]+class=["'][^"']*(?:product|pdp|page)[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ])
  const brand = extractFirstElementText(html, [/<[^>]+class=["'][^"']*brand[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i]) || detectBrandFromText(title)
  const price = parsePrice(extractFirstElementText(html, [/<[^>]+class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i]))
  const images = extractAllElementTexts(html, [/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi])

  return {
    parserLabel: 'Tennis retailer parser',
    titleCandidates: title ? [{ value: title, source: 'retailer:h1', confidence: 'high' }] : [],
    brandCandidates: brand ? [{ value: brand, source: 'retailer:brand', confidence: 'medium' }] : [],
    priceCandidates: price != null ? [{ value: price, source: 'retailer:price', confidence: 'medium' }] : [],
    imageCandidates: images.map((value) => ({ value, source: 'retailer:image', confidence: 'medium' })),
    categoryHints: [],
    descriptionCandidates: [],
    specCandidates: {},
  }
}

function parseGenericPage(hostname: string, html: string): ExtractedPageData {
  const pageTitle = extractTitleTag(html)
  const metaTitle = extractMetaContent(html, 'name', 'title')
  const metaDescription = extractMetaContent(html, 'name', 'description')
  const ogTitle = extractMetaContent(html, 'property', 'og:title')
  const ogDescription = extractMetaContent(html, 'property', 'og:description')
  const ogImage = extractMetaContent(html, 'property', 'og:image')
  const ogPrice = extractMetaContent(html, 'property', 'product:price:amount') || extractMetaContent(html, 'property', 'og:price:amount')
  const visibleTitle = extractFirstElementText(html, [
    /<h1[^>]+id=["'][^"']*product[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]+class=["'][^"']*(?:product|pdp|page)[^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/h1>/i,
    /<h1[^>]*>([\s\S]*?)<\/h1>/i,
  ])
  const visibleBrand = extractFirstElementText(html, [
    /<[^>]+class=["'][^"']*brand[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<[^>]+data-automation=["']brand["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
  ])
  const priceText = extractFirstElementText(html, [
    /<[^>]+class=["'][^"']*price[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["']/i,
  ])
  const pageText = htmlToText(html)
  const specCandidates: ExtractedPageData['specCandidates'] = {}
  extractSpecFromText(specCandidates, pageText, 'head_size', /\bhead size\b[:\s-]{0,4}([^.;|]{1,32})/i)
  extractSpecFromText(specCandidates, pageText, 'string_pattern', /\bstring pattern\b[:\s-]{0,4}([^.;|]{1,18})/i)
  extractSpecFromText(specCandidates, pageText, 'length', /\blength\b[:\s-]{0,4}([^.;|]{1,24})/i)
  extractSpecFromText(specCandidates, pageText, 'grip_size', /\bgrip size\b[:\s-]{0,4}([^.;|]{1,24})/i)

  return {
    parserLabel: `Generic parser (${hostname})`,
    titleCandidates: uniqueCandidates([
      ...(visibleTitle ? [{ value: visibleTitle, source: 'generic:h1', confidence: 'medium' as const }] : []),
      ...(metaTitle ? [{ value: metaTitle, source: 'generic:meta-title', confidence: 'medium' as const }] : []),
      ...(ogTitle ? [{ value: ogTitle, source: 'generic:og-title', confidence: 'medium' as const }] : []),
      ...(pageTitle ? [{ value: pageTitle, source: 'generic:title', confidence: 'low' as const }] : []),
    ]),
    brandCandidates: uniqueCandidates([
      ...(visibleBrand ? [{ value: visibleBrand, source: 'generic:brand', confidence: 'medium' as const }] : []),
      ...(detectBrandFromText(`${visibleTitle} ${ogTitle} ${pageTitle}`) ? [{
        value: detectBrandFromText(`${visibleTitle} ${ogTitle} ${pageTitle}`) as string,
        source: 'generic:brand-in-title',
        confidence: 'low' as const,
      }] : []),
    ]),
    priceCandidates: uniqueCandidates([
      ...(parsePrice(ogPrice) != null ? [{ value: parsePrice(ogPrice) as number, source: 'generic:og-price', confidence: 'medium' as const }] : []),
      ...(parsePrice(priceText) != null ? [{ value: parsePrice(priceText) as number, source: 'generic:visible-price', confidence: 'low' as const }] : []),
      ...(parsePrice(pageText) != null ? [{ value: parsePrice(pageText) as number, source: 'generic:page-price', confidence: 'low' as const }] : []),
    ]),
    imageCandidates: uniqueCandidates([
      ...(ogImage ? [{ value: ogImage, source: 'generic:og-image', confidence: 'medium' as const }] : []),
    ]),
    categoryHints: uniqueCandidates([
      ...(metaDescription ? [{ value: metaDescription, source: 'generic:meta-description', confidence: 'low' as const }] : []),
      ...(ogDescription ? [{ value: ogDescription, source: 'generic:og-description', confidence: 'low' as const }] : []),
      ...(pageText ? [{ value: pageText.slice(0, 500), source: 'generic:page-text', confidence: 'low' as const }] : []),
    ]),
    descriptionCandidates: uniqueCandidates([
      ...(metaDescription ? [{ value: metaDescription, source: 'generic:meta-description', confidence: 'medium' as const }] : []),
      ...(ogDescription ? [{ value: ogDescription, source: 'generic:og-description', confidence: 'medium' as const }] : []),
    ]),
    specCandidates,
  }
}

function extractSpecFromText(
  specCandidates: ExtractedPageData['specCandidates'],
  pageText: string,
  field: 'head_size' | 'string_pattern' | 'length' | 'grip_size',
  pattern: RegExp,
) {
  const raw = cleanText(pageText.match(pattern)?.[1])
  const normalized = normalizeSpecValue(field, raw)
  if (!normalized) return
  specCandidates[field] = [{ value: normalized, source: `generic:${field}`, confidence: 'medium' }]
}

function normalizeSpecValue(field: 'head_size' | 'string_pattern' | 'length' | 'grip_size', raw: string): string | null {
  if (!raw) return null
  if (field === 'string_pattern') {
    const match = raw.match(/(\d{1,2})\s*[xX]\s*(\d{1,2})/)
    return match ? `${match[1]}x${match[2]}` : null
  }
  if (field === 'head_size') {
    const match = raw.match(/(\d{2,3}(?:\.\d+)?)\s*(sq\.?\s*in|in2|in²|cm2|cm²)?/i)
    return match ? cleanText(`${match[1]} ${match[2] ?? ''}`) : null
  }
  if (field === 'length') {
    const match = raw.match(/(\d{2,3}(?:\.\d+)?)\s*(inches|inch|in|cm)?/i)
    return match ? cleanText(`${match[1]} ${match[2] ?? ''}`) : null
  }
  if (field === 'grip_size') {
    const match = raw.match(/(L[0-5]|[0-5]|4\s+\d\/\d)/i)
    return match ? cleanText(match[1].toUpperCase()) : null
  }
  return cleanText(raw) || null
}

function parsePrice(text: string | null | undefined): number | null {
  const cleaned = cleanText(text)
  if (!cleaned) return null
  const match = cleaned.match(/(?:CA\$|C\$|US\$|\$|£|€)\s?(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)/i)
    ?? cleaned.match(/\b(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)\b/)
  if (!match) return null
  const parsed = Number.parseFloat(match[1].replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function detectBrandFromText(text: string): string | null {
  const normalized = normalizeForMatch(text)
  for (const brand of BRANDS) {
    if (normalized.includes(normalizeForMatch(brand))) return brand
  }
  return null
}

function cleanProductTitle(rawTitle: string, brand: string | null): string {
  let value = cleanText(rawTitle)
  if (!value) return ''

  const segments = value.split(/\s(?:\||-|–|—)\s/g).map((segment) => cleanText(segment)).filter(Boolean)
  if (segments.length > 1) {
    const preferred = segments.find((segment) => {
      const hasBrand = brand ? normalizeForMatch(segment).includes(normalizeForMatch(brand)) : false
      return hasBrand || !STORE_SUFFIX_HINTS.test(segment)
    })
    value = preferred ?? segments[0]
  }

  for (const pattern of MARKETPLACE_NOISE_PATTERNS) value = value.replace(pattern, ' ')

  value = value
    .replace(/\b(?:tennis|badminton)\s+(?:racket|racquet)\b/gi, ' ')
    .replace(/\bpickleball\s+paddle\b/gi, ' ')
    .replace(/\b(?:unstrung|strung|racquetball)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (brand) {
    const brandPattern = new RegExp(`^(${escapeRegExp(brand)})\\s+(${escapeRegExp(brand)})\\b`, 'i')
    value = value.replace(brandPattern, '$1')
    value = value.replace(new RegExp(`^${escapeRegExp(brand)}\\s+(?:tennis|badminton)\\s+`, 'i'), `${brand} `)
    if (!new RegExp(`^${escapeRegExp(brand)}\\b`, 'i').test(value) && normalizeForMatch(value).includes(normalizeForMatch(brand))) {
      value = `${brand} ${value.replace(new RegExp(escapeRegExp(brand), 'i'), '').trim()}`
    }
  }

  return value.replace(/(\d{1,2})\s*[xX]\s*(\d{1,2})/g, '$1x$2').replace(/\bV\s*([0-9]{1,2})\b/gi, 'V$1').replace(/\s+/g, ' ').trim()
}

function removeColorNoise(value: string): string {
  return value
    .split(' ')
    .filter((token) => !COLOR_WORDS.includes(token.toLowerCase()))
    .join(' ')
}

function classifyGear(
  text: string,
  hostname: string,
  structuredCategory: string | null,
  brand: string | null,
): { category: GearCategory; gear_type: string | null; categoryConfidence: GearLinkFieldConfidence; gearTypeConfidence: GearLinkFieldConfidence | null } {
  const normalized = normalizeForMatch(`${text} ${structuredCategory ?? ''} ${hostname} ${brand ?? ''}`)
  const scores: Record<GearCategory, number> = { rackets: 0, shoes: 0, apparel: 0, strings: 0, accessories: 0, other: 0 }
  const addScore = (category: GearCategory, patterns: RegExp[], points: number) => {
    for (const pattern of patterns) if (pattern.test(normalized)) scores[category] += points
  }

  addScore('rackets', [/\bracket\b/, /\bracquet\b/, /\bblade\b/, /\bclash\b/, /\bezone\b/, /\bvcore\b/, /\bpercept\b/, /\bpure aero\b/, /\bpure drive\b/, /\bpure strike\b/, /\bspeed mp\b/, /\bgravity mp\b/, /\bpaddle\b/], 3)
  addScore('shoes', [/\bshoe\b/, /\bsneaker\b/, /\bcourt ff\b/, /\bgel resolution\b/, /\bvapor\b/, /\bvapour\b/], 3)
  addScore('strings', [/\bstring\b/, /\bpoly\b/, /\bmulti(?:filament)?\b/, /\bsynthetic gut\b/], 3)
  addScore('apparel', [/\bshirt\b/, /\bshort\b/, /\bdress\b/, /\bskirt\b/, /\bhoodie\b/, /\bjacket\b/], 3)
  addScore('accessories', [/\bbag\b/, /\bovergrip\b/, /\bdampener\b/, /\bhat\b/, /\bcap\b/, /\bwristband\b/], 3)

  if (/(wilson|yonex|babolat|head|tecnifibre|dunlop)/i.test(hostname) && scores.rackets === 0) scores.rackets += 1
  if (structuredCategory) addScore('rackets', [/\bracket\b/, /\bracquet\b/, /\bpaddle\b/], 4)

  let category: GearCategory = 'other'
  let highest = 0
  for (const [key, score] of Object.entries(scores) as Array<[GearCategory, number]>) {
    if (score > highest) {
      highest = score
      category = key
    }
  }

  const categoryConfidence: GearLinkFieldConfidence = highest >= 6 ? 'high' : highest >= 3 ? 'medium' : 'low'
  if (category !== 'rackets') return { category, gear_type: null, categoryConfidence, gearTypeConfidence: null }
  if (/\bpickleball\b|\bpaddle\b/.test(normalized)) return { category, gear_type: 'Pickleball Paddle', categoryConfidence, gearTypeConfidence: 'high' }
  if (/\bbadminton\b/.test(normalized)) return { category, gear_type: 'Badminton Racquet', categoryConfidence, gearTypeConfidence: 'high' }
  if (/\btennis\b|\bblade\b|\bclash\b|\bezone\b|\bvcore\b|\bpercept\b|\bpure aero\b|\bpure drive\b|\bpure strike\b|\bspeed mp\b|\bgravity mp\b/.test(normalized)) {
    return { category, gear_type: 'Tennis Racquet', categoryConfidence, gearTypeConfidence: 'high' }
  }
  return { category, gear_type: null, categoryConfidence, gearTypeConfidence: 'low' }
}

function standardizeRacketName(cleanedTitle: string, brand: string | null): { itemName: string; confidence: GearLinkFieldConfidence; matchedOption: string | null } {
  const candidateText = removeColorNoise(cleanedTitle)
  const normalizedCandidate = normalizeForMatch(candidateText)
  if (!normalizedCandidate) return { itemName: cleanedTitle, confidence: 'low', matchedOption: null }

  let bestOption: string | null = null
  let bestScore = 0
  for (const option of TENNIS_RACKET_OPTIONS) {
    if (brand && !normalizeForMatch(option).includes(normalizeForMatch(brand))) continue
    const normalizedOption = normalizeForMatch(option)
    if (normalizedCandidate === normalizedOption) {
      bestOption = option
      bestScore = 200
      break
    }

    const candidateTokens = tokenizeForMatch(normalizedCandidate)
    const optionTokens = tokenizeForMatch(normalizedOption)
    const numericTokens = optionTokens.filter((token) => /\d/.test(token))
    const sharedTokens = optionTokens.filter((token) => candidateTokens.includes(token))
    let score = 0
    if (normalizedCandidate.includes(normalizedOption)) score += 130
    score += sharedTokens.reduce((sum, token) => sum + Math.min(token.length, 8), 0)
    if (numericTokens.length > 0 && numericTokens.every((token) => candidateTokens.includes(token))) score += 25
    if (brand && candidateTokens.includes(normalizeForMatch(brand))) score += 10
    if (score > bestScore) {
      bestScore = score
      bestOption = option
    }
  }

  if (!bestOption || bestScore < 35) return { itemName: cleanedTitle, confidence: cleanedTitle ? 'medium' : 'low', matchedOption: null }
  const yearMatch = cleanedTitle.match(/\b(20[1-3][0-9])\b/)
  const normalizedOption = yearMatch && !/\b20[1-3][0-9]\b/.test(bestOption) ? `${bestOption} (${yearMatch[1]})` : bestOption
  return { itemName: normalizedOption, confidence: bestScore >= 120 ? 'high' : 'medium', matchedOption: bestOption }
}

function extractFallbackNameFromUrl(url: string): string {
  return cleanText(url.split('/').filter(Boolean).pop()?.replace(/[-_]+/g, ' ').replace(/\.[a-z0-9]+$/i, '') ?? 'Saved item')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildParserData(url: URL, html: string): ExtractedPageData {
  const hostname = url.hostname.toLowerCase()
  const structured = parseStructuredProducts(html)
  const siteSpecific = parseAmazonPage(hostname, html) ?? parseBrandSitePage(hostname, html) ?? parseTennisRetailerPage(hostname, html)
  const generic = parseGenericPage(hostname, html)

  return {
    parserLabel: siteSpecific?.parserLabel ?? structured.parserLabel ?? generic.parserLabel,
    titleCandidates: uniqueCandidates([...structured.titleCandidates, ...(siteSpecific?.titleCandidates ?? []), ...generic.titleCandidates]),
    brandCandidates: uniqueCandidates([...structured.brandCandidates, ...(siteSpecific?.brandCandidates ?? []), ...generic.brandCandidates]),
    priceCandidates: uniqueCandidates([...structured.priceCandidates, ...(siteSpecific?.priceCandidates ?? []), ...generic.priceCandidates]),
    imageCandidates: uniqueCandidates([...structured.imageCandidates, ...(siteSpecific?.imageCandidates ?? []), ...generic.imageCandidates]),
    categoryHints: uniqueCandidates([...structured.categoryHints, ...(siteSpecific?.categoryHints ?? []), ...generic.categoryHints]),
    descriptionCandidates: uniqueCandidates([...structured.descriptionCandidates, ...(siteSpecific?.descriptionCandidates ?? []), ...generic.descriptionCandidates]),
    specCandidates: {
      head_size: uniqueCandidates([...(structured.specCandidates.head_size ?? []), ...(siteSpecific?.specCandidates.head_size ?? []), ...(generic.specCandidates.head_size ?? [])]),
      string_pattern: uniqueCandidates([...(structured.specCandidates.string_pattern ?? []), ...(siteSpecific?.specCandidates.string_pattern ?? []), ...(generic.specCandidates.string_pattern ?? [])]),
      length: uniqueCandidates([...(structured.specCandidates.length ?? []), ...(siteSpecific?.specCandidates.length ?? []), ...(generic.specCandidates.length ?? [])]),
      grip_size: uniqueCandidates([...(structured.specCandidates.grip_size ?? []), ...(siteSpecific?.specCandidates.grip_size ?? []), ...(generic.specCandidates.grip_size ?? [])]),
    },
  }
}

export async function importGearDraftFromLink(url: string): Promise<GearLinkImportDraft> {
  const normalizedUrl = cleanText(url)
  const parsedUrl = new URL(normalizedUrl)
  const response = await fetch(normalizedUrl, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; PlayerHoods Gear Import/2.0)',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'follow',
  })

  if (!response.ok) throw new Error(`Could not fetch product page (${response.status}).`)

  const html = await response.text()
  const parserData = buildParserData(parsedUrl, html)
  const bestBrand = pickBestCandidate(parserData.brandCandidates)
  const rawTitle = pickBestCandidate(parserData.titleCandidates)?.value ?? extractFallbackNameFromUrl(normalizedUrl)
  const cleanedTitle = cleanProductTitle(rawTitle, bestBrand?.value ?? null)
  const structuredCategoryHint = pickBestCandidate(parserData.categoryHints)?.value ?? null
  const categoryContext = [cleanedTitle, pickBestCandidate(parserData.descriptionCandidates)?.value ?? '', structuredCategoryHint ?? '', parsedUrl.hostname].join(' ')
  const classification = classifyGear(categoryContext, parsedUrl.hostname, structuredCategoryHint, bestBrand?.value ?? null)
  const standardizedRacket = classification.category === 'rackets'
    ? standardizeRacketName(cleanedTitle, bestBrand?.value ?? null)
    : { itemName: cleanedTitle, confidence: pickBestCandidate(parserData.titleCandidates)?.confidence ?? 'low', matchedOption: null }

  const itemName = standardizedRacket.itemName || cleanedTitle || extractFallbackNameFromUrl(normalizedUrl)
  const itemNameConfidence = standardizedRacket.matchedOption ? standardizedRacket.confidence : (pickBestCandidate(parserData.titleCandidates)?.confidence ?? 'low')
  const specHeadSize = pickBestCandidate(parserData.specCandidates.head_size ?? [])
  const specStringPattern = pickBestCandidate(parserData.specCandidates.string_pattern ?? [])
  const specLength = pickBestCandidate(parserData.specCandidates.length ?? [])
  const specGripSize = pickBestCandidate(parserData.specCandidates.grip_size ?? [])
  const bestPrice = pickBestCandidate(parserData.priceCandidates)
  const bestImage = pickBestCandidate(parserData.imageCandidates)
  const detectedBrand = bestBrand?.value ?? detectBrandFromText(itemName)
  const notes: string[] = []

  if (standardizedRacket.matchedOption) notes.push('Matched to the internal racquet name list for cleaner naming.')
  else if (classification.category === 'rackets') notes.push('Used a cleaned product title because exact racquet standardization was uncertain.')
  if (itemNameConfidence !== 'high') notes.push('Review the detected name before saving.')
  if (classification.categoryConfidence !== 'high') notes.push('Category was inferred from page text and may need a quick check.')

  return {
    item_name: itemName,
    category: classification.category,
    gear_type: classification.gear_type,
    source_link: normalizedUrl,
    source_price: bestPrice?.value ?? null,
    image_url: bestImage?.value ?? null,
    brand: detectedBrand,
    head_size: specHeadSize?.value ?? null,
    string_pattern: specStringPattern?.value ?? null,
    length: specLength?.value ?? null,
    grip_size: specGripSize?.value ?? null,
    metadata: {
      imported_from_link: true,
      imported_at: new Date().toISOString(),
      parser_label: parserData.parserLabel,
      matched_racket_option: standardizedRacket.matchedOption,
      raw_title: rawTitle,
      cleaned_title: cleanedTitle,
      hostname: parsedUrl.hostname,
    },
    detected_fields: [
      itemName ? 'item_name' : '',
      classification.category ? 'category' : '',
      classification.gear_type ? 'gear_type' : '',
      detectedBrand ? 'brand' : '',
      bestImage?.value ? 'image' : '',
      bestPrice?.value != null ? 'price' : '',
      specHeadSize?.value ? 'head_size' : '',
      specStringPattern?.value ? 'string_pattern' : '',
      specLength?.value ? 'length' : '',
      specGripSize?.value ? 'grip_size' : '',
    ].filter(Boolean),
    confidence: {
      item_name: itemNameConfidence,
      category: classification.categoryConfidence,
      brand: bestBrand?.confidence ?? (detectedBrand ? 'low' : undefined),
      price: bestPrice?.confidence,
      gear_type: classification.gearTypeConfidence ?? undefined,
      image: bestImage?.confidence,
      head_size: specHeadSize?.confidence,
      string_pattern: specStringPattern?.confidence,
      length: specLength?.confidence,
      grip_size: specGripSize?.confidence,
    },
    parser_label: parserData.parserLabel,
    notes,
  }
}
