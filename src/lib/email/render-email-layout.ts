import { SUPPORT_EMAIL } from '@/lib/legal'

export type EmailDetail = {
  label: string
  value: string
}

export type RenderEmailLayoutInput = {
  title: string
  eyebrow?: string
  introHtml: string
  details?: EmailDetail[]
  ctaLabel?: string
  ctaUrl?: string
  ctaHint?: string
  secondaryTitle?: string
  secondaryBody?: string
  secondaryLinkLabel?: string
  secondaryLinkUrl?: string
  footerNote?: string
  siteUrl?: string
}

const FALLBACK_SITE_URL = 'http://localhost:3000'

export function normalizeEmailBaseUrl(siteUrl: string | null | undefined): string {
  if (!siteUrl || siteUrl === 'undefined') return FALLBACK_SITE_URL
  return siteUrl
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderEmailLayout(input: RenderEmailLayoutInput): string {
  const baseUrl = normalizeEmailBaseUrl(input.siteUrl)
  const termsUrl = `${baseUrl}/terms`
  const privacyUrl = `${baseUrl}/privacy`
  const details = (input.details ?? []).filter((detail) => detail.value.trim().length > 0)
  const detailsHtml =
    details.length > 0
      ? `
        <div class="ph-details">
          ${details
            .map(
              (detail) => `
                <div class="ph-detail">
                  <div class="ph-detail-label">${escapeHtml(detail.label)}</div>
                  <div class="ph-detail-value">${escapeHtml(detail.value)}</div>
                </div>`,
            )
            .join('')}
        </div>`
      : ''

  const ctaHtml =
    input.ctaLabel && input.ctaUrl
      ? `
        <div class="ph-cta-wrap">
          <a href="${escapeHtml(input.ctaUrl)}" class="ph-cta">${escapeHtml(input.ctaLabel)}</a>
          ${input.ctaHint ? `<div class="ph-cta-hint">${escapeHtml(input.ctaHint)}</div>` : ''}
        </div>`
      : ''

  const secondaryHtml =
    input.secondaryTitle || input.secondaryBody || (input.secondaryLinkLabel && input.secondaryLinkUrl)
      ? `
        <div class="ph-secondary">
          ${input.secondaryTitle ? `<div class="ph-secondary-title">${escapeHtml(input.secondaryTitle)}</div>` : ''}
          ${input.secondaryBody ? `<p class="ph-secondary-body">${escapeHtml(input.secondaryBody)}</p>` : ''}
          ${
            input.secondaryLinkLabel && input.secondaryLinkUrl
              ? `<a href="${escapeHtml(input.secondaryLinkUrl)}" class="ph-secondary-link">${escapeHtml(input.secondaryLinkLabel)}</a>`
              : ''
          }
        </div>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.title)}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #eef1f7;
      color: #334155;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
    }
    .ph-shell {
      max-width: 640px;
      margin: 0 auto;
      padding: 32px 16px 48px;
    }
    .ph-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 28px;
      overflow: hidden;
      box-shadow: 0 24px 50px -40px rgba(30, 41, 59, 0.22);
    }
    .ph-header {
      padding: 32px 32px 20px;
      background: linear-gradient(180deg, #ffffff 0%, #f8fbff 100%);
    }
    .ph-brand {
      color: #1e293b;
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.03em;
      margin: 0 0 18px;
    }
    .ph-eyebrow {
      display: inline-block;
      margin-bottom: 12px;
      padding: 6px 12px;
      border-radius: 999px;
      background: #f9e2d8;
      color: #9a3412;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .ph-title {
      margin: 0 0 12px;
      color: #1e293b;
      font-size: 28px;
      line-height: 1.2;
      font-weight: 800;
      letter-spacing: -0.03em;
    }
    .ph-intro {
      margin: 0;
      color: #475569;
      font-size: 15px;
    }
    .ph-body {
      padding: 0 32px 32px;
    }
    .ph-details {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
      margin-top: 20px;
      padding: 16px;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      background: #f8fbff;
    }
    .ph-detail-label {
      margin-bottom: 4px;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
    .ph-detail-value {
      color: #1e293b;
      font-size: 14px;
      font-weight: 700;
      line-height: 1.45;
    }
    .ph-cta-wrap {
      padding-top: 24px;
      text-align: left;
    }
    .ph-cta {
      display: inline-block;
      padding: 13px 22px;
      border-radius: 999px;
      background: #c25e46;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-decoration: none;
      text-transform: uppercase;
      box-shadow: 0 12px 28px rgba(194, 94, 70, 0.24);
    }
    .ph-cta-hint {
      margin-top: 10px;
      color: #94a3b8;
      font-size: 12px;
    }
    .ph-secondary {
      margin-top: 28px;
      padding: 18px 18px 16px;
      border: 1px solid #e2e8f0;
      border-radius: 20px;
      background: #f8fbff;
    }
    .ph-secondary-title {
      margin: 0 0 8px;
      color: #1e293b;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .ph-secondary-body {
      margin: 0;
      color: #475569;
      font-size: 14px;
    }
    .ph-secondary-link {
      display: inline-block;
      margin-top: 12px;
      color: #c25e46;
      font-size: 13px;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ph-footer {
      margin-top: 18px;
      color: #94a3b8;
      font-size: 12px;
      text-align: center;
    }
    .ph-footer a {
      color: #64748b;
      text-decoration: underline;
      text-underline-offset: 2px;
      margin: 0 8px;
    }
    .ph-footer-note {
      margin-bottom: 10px;
    }
  </style>
</head>
<body>
  <div class="ph-shell">
    <div class="ph-card">
      <div class="ph-header">
        <div class="ph-brand">PlayerHoods</div>
        ${input.eyebrow ? `<div class="ph-eyebrow">${escapeHtml(input.eyebrow)}</div>` : ''}
        <h1 class="ph-title">${escapeHtml(input.title)}</h1>
        <p class="ph-intro">${input.introHtml}</p>
      </div>
      <div class="ph-body">
        ${detailsHtml}
        ${ctaHtml}
        ${secondaryHtml}
      </div>
    </div>
    <div class="ph-footer">
      ${input.footerNote ? `<div class="ph-footer-note">${escapeHtml(input.footerNote)}</div>` : ''}
      <div>
        <a href="${escapeHtml(termsUrl)}">Terms of Use</a>
        <a href="${escapeHtml(privacyUrl)}">Privacy Notice</a>
        <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">Contact</a>
      </div>
    </div>
  </div>
</body>
</html>`
}
