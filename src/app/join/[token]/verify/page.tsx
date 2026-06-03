import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BrandLogo } from '@/app/components/BrandLogo'
import { verifyPublicMatchSignupAction } from '../actions'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ token: string }>
  searchParams: Promise<{
    signup?: string
    token?: string
    status?: string
    error?: string
  }>
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}

function getVerifyErrorMessage(code: string | undefined): string | null {
  switch (code) {
  case 'expired':
    return 'This verification link expired. Submit the signup form again to get a new email.'
  case 'invalid':
    return 'This verification link is not valid.'
  case 'match-not-active':
    return 'This match is no longer open for public signup.'
  case 'link-not-found':
    return 'This signup link is no longer available.'
  case 'failed':
    return 'Could not verify this signup. Please submit the form again.'
  default:
    return null
  }
}

export default async function PublicMatchSignupVerifyPage({ params, searchParams }: Props) {
  const { token: publicToken } = await params
  const pageParams = await searchParams
  const signupId = pageParams.signup ?? ''
  const verificationToken = pageParams.token ?? ''
  const errorMessage = getVerifyErrorMessage(pageParams.error)
  const isVerified = pageParams.status === 'verified'
  const hasVerificationInput = isUuid(signupId) && isUuid(verificationToken)

  if (!isUuid(publicToken)) {
    notFound()
  }

  if (!isVerified && !errorMessage && !hasVerificationInput) {
    notFound()
  }

  const isPendingConfirmation = !isVerified && !errorMessage && hasVerificationInput
  const verifyAction = verifyPublicMatchSignupAction.bind(null, publicToken)

  return (
    <div className="public-signup-verify-page">
      <style>{`
        .public-signup-verify-page {
          min-height: 100vh;
          background: #edf5ff;
          color: #06183d;
          padding: 32px 18px 48px;
        }

        .public-signup-verify-shell {
          width: min(100%, 720px);
          margin: 0 auto;
        }

        .public-signup-verify-brand {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 22px;
        }

        .public-signup-verify-card {
          background: rgba(255, 255, 255, 0.96);
          border: 1px solid #d5e2f2;
          border-radius: 28px;
          box-shadow: 0 18px 44px rgba(17, 42, 84, 0.08);
          padding: 30px;
        }

        .public-signup-verify-kicker {
          color: #7c8eaa;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.16em;
          margin: 0 0 14px;
          text-transform: uppercase;
        }

        .public-signup-verify-title {
          font-size: clamp(2rem, 3.5vw, 2.65rem);
          line-height: 1.08;
          margin: 0;
          letter-spacing: 0;
        }

        .public-signup-verify-body {
          color: #405474;
          font-size: 1rem;
          font-weight: 650;
          line-height: 1.55;
          margin: 14px 0 0;
        }

        .public-signup-verify-status {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 22px;
        }

        .public-signup-verify-pill {
          border-radius: 999px;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          font-size: 0.78rem;
          font-weight: 850;
          padding: 7px 11px;
        }

        .public-signup-verify-pill.green {
          border-color: #a7f3d0;
          background: #ecfdf5;
          color: #047857;
        }

        .public-signup-verify-pill.orange {
          border-color: #fed7aa;
          background: #fff7ed;
          color: #b45309;
        }

        .public-signup-verify-link {
          display: inline-flex;
          margin-top: 24px;
          color: #2554d9;
          font-size: 0.9rem;
          font-weight: 850;
          text-decoration: none;
        }

        .public-signup-verify-form {
          margin-top: 24px;
        }

        .public-signup-verify-button {
          appearance: none;
          background: #2554d9;
          border: 0;
          border-radius: 14px;
          color: #ffffff;
          cursor: pointer;
          font-size: 0.95rem;
          font-weight: 900;
          padding: 12px 18px;
        }
      `}</style>

      <main className="public-signup-verify-shell">
        <div className="public-signup-verify-brand">
          <BrandLogo variant="horizontal" />
        </div>

        <section className="public-signup-verify-card">
          <p className="public-signup-verify-kicker">Open to Join</p>
          <h1 className="public-signup-verify-title">
            {isVerified ? 'Email verified' : errorMessage ? 'Verification failed' : 'Verify your email'}
          </h1>
          <p className="public-signup-verify-body">
            {isVerified
              ? 'Thanks. Your request is pending host approval. You are not in the confirmed lineup yet.'
              : errorMessage ?? 'Confirm this signup request. The host will still need to add you to the lineup.'}
          </p>

          {isVerified ? (
            <div className="public-signup-verify-status" aria-label="Signup status">
              <span className="public-signup-verify-pill">Signed up by public link</span>
              <span className="public-signup-verify-pill green">Email verified</span>
              <span className="public-signup-verify-pill orange">Pending approval</span>
            </div>
          ) : null}

          {isPendingConfirmation ? (
            <form action={verifyAction} className="public-signup-verify-form">
              <input type="hidden" name="signup" value={signupId} />
              <input type="hidden" name="token" value={verificationToken} />
              <button type="submit" className="public-signup-verify-button">
                Verify email
              </button>
            </form>
          ) : null}

          <Link href={`/join/${publicToken}`} className="public-signup-verify-link">
            Back to match signup
          </Link>
        </section>
      </main>
    </div>
  )
}
