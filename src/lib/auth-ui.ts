export const MIN_PASSWORD_LENGTH = 8
export const AUTH_SUBMIT_THROTTLE_MS = 1500

type AuthAction = 'login' | 'register' | 'forgot' | 'reset'

export function sanitizeNextPath(input: string | null | undefined, fallback = '/dashboard') {
  if (!input || !input.startsWith('/')) return fallback
  if (input.startsWith('//')) return fallback
  return input
}

export function getConfiguredSiteOrigin() {
  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (!configuredSiteUrl) return null

  try {
    return new URL(configuredSiteUrl).origin
  } catch {
    return null
  }
}

export function getConfiguredSiteHost() {
  const origin = getConfiguredSiteOrigin()
  if (!origin) return null

  try {
    return new URL(origin).hostname
  } catch {
    return null
  }
}

export function shouldUseCanonicalLocalAuthHost(currentHost: string | null | undefined) {
  const configuredHost = getConfiguredSiteHost()
  if (configuredHost !== 'localhost') return false
  return !!currentHost && currentHost !== 'localhost'
}

export function maskEmail(email: string | null | undefined) {
  if (!email) return ''

  const [localPart, domainPart] = email.split('@')
  if (!localPart || !domainPart) return email

  const visiblePrefix = localPart.slice(0, Math.min(2, localPart.length))
  return `${visiblePrefix}${'*'.repeat(Math.max(localPart.length - visiblePrefix.length, 3))}@${domainPart}`
}

function getAuthErrorText(error: unknown) {
  if (!error) return ''
  if (typeof error === 'string') return error.toLowerCase()
  if (error instanceof Error) return error.message.toLowerCase()

  const maybeMessage = (error as { message?: unknown }).message
  return typeof maybeMessage === 'string' ? maybeMessage.toLowerCase() : ''
}

export function mapAuthErrorToUiMessage(action: AuthAction, error?: unknown) {
  const errorText = getAuthErrorText(error)

  if (action === 'register') {
    if (errorText.includes('email signups are disabled') || errorText.includes('email_provider_disabled')) {
      return 'Email sign-up is currently disabled. Please continue with Google, or try again after email sign-up is enabled.'
    }

    if (errorText.includes('error sending confirmation email')) {
      return 'We could not send the confirmation email right now. Please try again in a few minutes, or continue with Google.'
    }

    if (
      errorText.includes('already registered')
      || errorText.includes('already exists')
      || errorText.includes('user already')
    ) {
      return 'This email already has an account. Please sign in, or continue with Google if you used Google before.'
    }

    if (errorText.includes('rate limit') || errorText.includes('too many')) {
      return 'Too many sign-up emails were requested. Please wait a few minutes and try again.'
    }
  }

  switch (action) {
    case 'login':
      return 'Email or password is incorrect. If you signed up with Google, use "Continue with Google".'
    case 'register':
      return 'We could not complete sign up right now. Please try again, or try signing in if you already have an account.'
    case 'forgot':
      return 'We could not start password reset right now. Please try again in a moment.'
    case 'reset':
      return 'We could not update your password. Please request a new reset link and try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}
