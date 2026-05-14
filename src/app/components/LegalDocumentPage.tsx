import {
  LEGAL_DOCUMENT_INTRO,
  LEGAL_DOCUMENT_SECTIONS,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_WEBSITE,
  SUPPORT_EMAIL,
} from '@/lib/legal'
import { BrandLogo } from '@/app/components/BrandLogo'

export function LegalDocumentPage({
  pageTitle,
  subtitle,
  focusPrivacy,
}: {
  pageTitle: string
  subtitle: string
  focusPrivacy?: boolean
}) {
  return (
    <div className="mx-auto max-w-[960px] px-4 py-10">
      <div className="mb-6">
        <BrandLogo variant="horizontal" />
      </div>
      <section className="rounded-[32px] border border-[#E2E8F0] bg-white px-8 py-8 shadow-[0_18px_40px_-30px_rgba(30,41,59,0.18)]">
        <div className="mb-8">
          <div className="ph-kicker mb-3">Legal</div>
          <h1 className="ph-title">{pageTitle}</h1>
          <p className="ph-subtitle mt-3 max-w-[720px] text-[13px] leading-6">
            {subtitle}
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-[13px] text-[#64748B]">
            <span>Effective Date: {LEGAL_EFFECTIVE_DATE}</span>
            <span>Website: {LEGAL_WEBSITE}</span>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="underline underline-offset-2 hover:text-[#1E293B]">
              Contact: {SUPPORT_EMAIL}
            </a>
          </div>
          {focusPrivacy ? (
            <div className="mt-4 rounded-2xl border border-[#E2E8F0] bg-[#F8FBFF] px-4 py-3 text-sm text-[#475569]">
              Privacy-specific sections begin at Section 11.
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-[24px] border border-[#E2E8F0] bg-[#F8FBFF] px-5 py-4 text-[13px] text-[#64748B]">
          <div className="font-semibold text-[#1E293B]">PlayerHoods Terms of Use and Privacy Notice</div>
          {LEGAL_DOCUMENT_INTRO.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        <div className="mt-8 space-y-6 text-[15px] leading-7 text-[#475569]">
          {LEGAL_DOCUMENT_SECTIONS.map((section) => (
            <section key={section.number} id={`section-${section.number}`}>
              <h2 className="text-h2 text-[#1E293B]">
                {section.number}. {section.title}
              </h2>
              <div className="mt-2 space-y-3">
                {section.paragraphs.map((paragraph) => (
                  <p key={`${section.number}-${paragraph}`}>{paragraph}</p>
                ))}
                {section.bullets ? (
                  <ul className="list-disc space-y-2 pl-6">
                    {section.bullets.map((bullet) => (
                      <li key={`${section.number}-${bullet}`}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  )
}
