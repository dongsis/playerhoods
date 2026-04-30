import { TENNIS_RACKET_OPTIONS } from '@/lib/tennis-racket-options'

export type RacketRecognitionDraft = {
  racket_name: string | null
  racket_type: string
  confidence: 'high' | 'medium' | 'low'
  detected_text: string[]
  model_specs: Record<string, string>
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreCandidate(haystack: string, candidate: string): number {
  const normalizedCandidate = normalize(candidate)
  if (!normalizedCandidate) return 0
  if (haystack.includes(normalizedCandidate)) return normalizedCandidate.length + 10

  const words = normalizedCandidate.split(' ').filter(Boolean)
  let score = 0
  for (const word of words) {
    if (haystack.includes(word)) score += word.length
  }
  return score
}

export function recognizeRacketFromPhotoHints(files: File[], manualHints?: string): RacketRecognitionDraft {
  const fileText = files
    .map((file) => file.name.replace(/\.[a-z0-9]+$/i, ' '))
    .join(' ')
  const combined = normalize(`${fileText} ${manualHints ?? ''}`)

  let bestMatch: string | null = null
  let bestScore = 0
  for (const option of TENNIS_RACKET_OPTIONS) {
    const score = scoreCandidate(combined, option)
    if (score > bestScore) {
      bestScore = score
      bestMatch = option
    }
  }

  const type =
    /pickleball|paddle/.test(combined)
      ? 'Pickleball Paddle'
      : /badminton/.test(combined)
        ? 'Badminton Racquet'
        : 'Tennis Racquet'

  const confidence =
    bestScore >= 20
      ? 'high'
      : bestScore >= 10
        ? 'medium'
        : 'low'

  return {
    racket_name: bestMatch,
    racket_type: type,
    confidence,
    detected_text: combined
      .split(' ')
      .filter(Boolean)
      .slice(0, 12),
    model_specs: bestMatch
      ? {
          recognized_from: 'photo_filename_hints',
          suggested_model: bestMatch,
        }
      : {
          recognized_from: 'photo_filename_hints',
        },
  }
}
