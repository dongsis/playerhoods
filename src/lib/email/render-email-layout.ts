import { SUPPORT_EMAIL } from '@/lib/legal'
import { getSiteOrigin } from '@/lib/site-url'

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
  promoTitle?: string
  promoBody?: string
  promoCtaLabel?: string
  promoCtaUrl?: string
  promoBullets?: string[]
  secondaryTitle?: string
  secondaryBody?: string
  secondaryLinkLabel?: string
  secondaryLinkUrl?: string
  footerNote?: string
  footerNoteHtml?: string
  siteUrl?: string
}

export function normalizeEmailBaseUrl(siteUrl: string | null | undefined): string {
  if (!siteUrl || siteUrl === 'undefined') return getSiteOrigin()
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
  const logoUrl = `${baseUrl}/playerhoods-brand-mark-cropped.png`
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

  const promoBullets = (input.promoBullets ?? []).filter((bullet) => bullet.trim().length > 0)
  const promoHtml =
    input.promoTitle || input.promoBody || (input.promoCtaLabel && input.promoCtaUrl) || promoBullets.length > 0
      ? `
        <div class="ph-promo">
          ${input.promoTitle ? `<div class="ph-promo-title">${escapeHtml(input.promoTitle)}</div>` : ''}
          ${input.promoBody ? `<p class="ph-promo-body">${escapeHtml(input.promoBody)}</p>` : ''}
          ${
            promoBullets.length > 0
              ? `<ul class="ph-promo-list">${promoBullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join('')}</ul>`
              : ''
          }
          ${
            input.promoCtaLabel && input.promoCtaUrl
              ? `<a href="${escapeHtml(input.promoCtaUrl)}" class="ph-promo-cta">${escapeHtml(input.promoCtaLabel)}</a>`
              : ''
          }
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
      display: inline-flex;
      align-items: center;
      gap: 10px;
      color: #1e293b;
      font-size: 24px;
      font-weight: 900;
      letter-spacing: -0.03em;
      margin: 0 0 18px;
    }
    .ph-brand-logo {
      display: inline-block;
      width: 42px;
      height: 42px;
      object-fit: contain;
      vertical-align: middle;
    }
    .ph-brand-text {
      display: inline-block;
      vertical-align: middle;
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
      background: #0d6efd;
      color: #ffffff !important;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-decoration: none;
      text-transform: uppercase;
      box-shadow: 0 12px 28px rgba(13, 110, 253, 0.24);
    }
    .ph-cta-hint {
      margin-top: 10px;
      color: #94a3b8;
      font-size: 12px;
    }
    .ph-promo {
      margin-top: 22px;
      padding: 18px 18px 16px;
      border: 1px solid #dbe7f5;
      border-radius: 20px;
      background: #ffffff;
    }
    .ph-promo-title {
      margin: 0 0 8px;
      color: #1e293b;
      font-size: 16px;
      font-weight: 850;
      letter-spacing: -0.01em;
    }
    .ph-promo-body {
      margin: 0 0 14px;
      color: #475569;
      font-size: 14px;
      line-height: 1.55;
    }
    .ph-promo-list {
      margin: 0 0 14px;
      padding: 0;
      list-style: none;
    }
    .ph-promo-list li {
      margin: 6px 0;
      color: #475569;
      font-size: 13px;
    }
    .ph-promo-list li::before {
      content: "✓";
      display: inline-block;
      margin-right: 8px;
      color: #0f766e;
      font-weight: 900;
    }
    .ph-promo-cta {
      display: inline-block;
      padding: 10px 16px;
      border: 1px solid #c8d7eb;
      border-radius: 999px;
      background: #ffffff;
      color: #16335f !important;
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
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
      color: #0d6efd;
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
        <div class="ph-brand">
          <img class="ph-brand-logo" src="${escapeHtml(logoUrl)}" width="42" height="42" alt="PlayerHoods">
          <span class="ph-brand-text">PlayerHoods</span>
        </div>
        ${input.eyebrow ? `<div class="ph-eyebrow">${escapeHtml(input.eyebrow)}</div>` : ''}
        <h1 class="ph-title">${escapeHtml(input.title)}</h1>
        <p class="ph-intro">${input.introHtml}</p>
      </div>
      <div class="ph-body">
        ${detailsHtml}
        ${ctaHtml}
        ${promoHtml}
        ${secondaryHtml}
      </div>
    </div>
    <div class="ph-footer">
      ${input.footerNoteHtml ? `<div class="ph-footer-note">${input.footerNoteHtml}</div>` : input.footerNote ? `<div class="ph-footer-note">${escapeHtml(input.footerNote)}</div>` : ''}
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
