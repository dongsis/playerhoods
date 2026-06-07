'use client'

import { useId, useState, type FormEvent } from 'react'
import { ContactScreenshotImportSection } from '@/app/dashboard/ContactScreenshotImportSection'
import type { ContactImportDraft, ContactScreenshotUpload } from '@/lib/contact-screenshot-import'
import type { ContactPlayerResolved } from '@/lib/api/roster'

type MobileTab = 'smart' | 'manual'

type Props = {
  userId: string
  existingContacts: ContactPlayerResolved[]
  onParseScreenshots?: (uploads: ContactScreenshotUpload[]) => Promise<ContactImportDraft[]>
  onImportScreenshotContacts?: (drafts: Array<{
    display_name: string
    phone?: string | null
    email?: string | null
    source_file_name?: string | null
  }>) => Promise<{ created: number; skipped: number }>
  onImported: () => Promise<void> | void
  displayName: string
  email: string
  phone: string
  notes: string
  creatingContact: boolean
  error?: string | null
  onDisplayNameChange: (value: string) => void
  onEmailChange: (value: string) => void
  onPhoneChange: (value: string) => void
  onNotesChange: (value: string) => void
  onManualSubmit: (event: FormEvent<HTMLFormElement>) => void
  onClose: () => void
  onCancel: () => void
  onClearError?: () => void
}

const BENEFITS = [
  {
    title: 'Save as player card',
    body: "Save your regular players or teammates so they're easy to invite next time.",
  },
  {
    title: 'Invite by link anytime',
    body: 'Send a private invite link anytime.',
  },
  {
    title: 'Email and SMS replies',
    body: 'They can reply without an account and still receive useful match updates.',
  },
  {
    title: 'Private by default',
    body: 'Contact details stay hidden unless you choose to share.',
  },
]

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <path d="m4.5 10.2 3.4 3.3 7.6-8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ContactField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
  multiline = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  multiline?: boolean
}) {
  return (
    <label className="text-label text-[#536179]">
      <span className="mb-2 ml-1 block uppercase tracking-[0.12em] text-[#64748B]">{label}</span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={4}
          className="text-body-main w-full resize-none rounded-2xl border border-[#A8B7CC] bg-white px-4 py-3 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="text-body-main h-14 w-full rounded-2xl border border-[#A8B7CC] bg-white px-4 text-[#0F172A] shadow-sm outline-none transition placeholder:text-[#64748B] focus:border-[#0d6efd] focus:ring-4 focus:ring-[#0d6efd]/10"
        />
      )}
    </label>
  )
}

function ManualEntryForm({
  displayName,
  email,
  phone,
  notes,
  creatingContact,
  error,
  onDisplayNameChange,
  onEmailChange,
  onPhoneChange,
  onNotesChange,
  onManualSubmit,
  onCancel,
}: Pick<Props,
  | 'displayName'
  | 'email'
  | 'phone'
  | 'notes'
  | 'creatingContact'
  | 'error'
  | 'onDisplayNameChange'
  | 'onEmailChange'
  | 'onPhoneChange'
  | 'onNotesChange'
  | 'onManualSubmit'
  | 'onCancel'
>) {
  return (
    <form onSubmit={onManualSubmit} className="grid gap-5">
      <div>
        <h4 className="text-xl font-black text-[#0B1F44]">Manual Entry</h4>
        <p className="mt-1 text-body-main text-[#64748B]">Enter one contact yourself.</p>
      </div>

      <ContactField
        label="Name"
        value={displayName}
        onChange={onDisplayNameChange}
        placeholder="Player's full name"
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <ContactField
          label="Email"
          value={email}
          onChange={onEmailChange}
          placeholder="email@example.com"
          type="email"
        />
        <ContactField
          label="Phone"
          value={phone}
          onChange={onPhoneChange}
          placeholder="+1 234 567 890"
          type="tel"
        />
      </div>
      <ContactField
        label="Notes"
        value={notes}
        onChange={onNotesChange}
        placeholder="Add details like skill level or preferred times..."
        multiline
      />

      {error ? (
        <p className="text-body-main rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={creatingContact}
          className="text-body-main inline-flex min-h-12 flex-1 items-center justify-center rounded-2xl bg-[#0d6efd] px-5 py-3 font-bold text-white shadow-[0_18px_34px_-20px_rgba(7,91,215,0.95)] transition hover:bg-[#0b5ed7] disabled:cursor-wait disabled:bg-[#94A3B8] sm:flex-none"
        >
          {creatingContact ? 'Saving...' : 'Save Contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-body-main min-h-11 rounded-2xl border border-[#D7E2F0] bg-white px-5 py-3 font-semibold text-[#475569] transition hover:bg-[#F8FBFF]"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

export function AddMyContactPanel({
  userId,
  existingContacts,
  onParseScreenshots,
  onImportScreenshotContacts,
  onImported,
  displayName,
  email,
  phone,
  notes,
  creatingContact,
  error,
  onDisplayNameChange,
  onEmailChange,
  onPhoneChange,
  onNotesChange,
  onManualSubmit,
  onClose,
  onCancel,
  onClearError,
}: Props) {
  const titleId = useId()
  const [mobileTab, setMobileTab] = useState<MobileTab>('smart')
  const smartImportAvailable = Boolean(onParseScreenshots && onImportScreenshotContacts)

  const selectMobileTab = (tab: MobileTab) => {
    setMobileTab(tab)
    onClearError?.()
  }

  return (
    <section
      id="add-my-contact-panel"
      aria-labelledby={titleId}
      className="overflow-hidden rounded-[40px] border border-[#E2E8F0] bg-white px-5 py-7 shadow-[0_26px_70px_-42px_rgba(11,31,68,0.35)] sm:px-8 lg:px-10"
    >
      <div className="flex items-start justify-between gap-4">
        <h3 id={titleId} className="min-w-0 text-[26px] font-black text-[#0B1F44] sm:text-[28px]">
          Add My Contact
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[#64748B] transition hover:bg-[#F1F5F9] hover:text-[#0B1F44]"
          aria-label="Close add contact panel"
        >
          <CloseIcon />
        </button>
      </div>

      <details className="mt-4 rounded-2xl border border-[#D7E2F0] bg-white px-4 py-3 sm:hidden">
        <summary className="cursor-pointer text-body-main font-black text-[#0B1F44]">
          4 benefits for adding contacts
        </summary>
        <div className="mt-4 space-y-4">
          {BENEFITS.map((benefit, index) => (
            <div key={benefit.title} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[12px] font-black text-[#0d6efd]">
                {index + 1}
              </span>
              <span>
                <span className="block text-body-main font-black text-[#0B1F44]">{benefit.title}</span>
                <span className="mt-1 block text-body-sub text-[#64748B]">{benefit.body}</span>
              </span>
            </div>
          ))}
        </div>
      </details>

      <div className="mt-6 hidden grid-cols-4 gap-4 border-b border-[#E2E8F0] pb-6 sm:grid">
        {BENEFITS.map((benefit) => (
          <div key={benefit.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eff6ff] text-[#0d6efd]">
              <CheckIcon />
            </span>
            <span className="min-w-0">
              <span className="block text-[12px] font-black leading-tight text-[#0B1F44]">{benefit.title}</span>
              <span className="mt-1 block text-[11px] leading-4 text-[#64748B]">{benefit.body}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 rounded-2xl border border-[#D7E2F0] bg-white p-1 text-body-main font-semibold sm:hidden">
        <button
          type="button"
          onClick={() => selectMobileTab('smart')}
          aria-pressed={mobileTab === 'smart'}
          className={[
            'min-h-11 rounded-xl px-3 transition',
            mobileTab === 'smart' ? 'border border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]' : 'text-[#0B1F44]',
          ].join(' ')}
        >
          Smart Import
        </button>
        <button
          type="button"
          onClick={() => selectMobileTab('manual')}
          aria-pressed={mobileTab === 'manual'}
          className={[
            'min-h-11 rounded-xl px-3 transition',
            mobileTab === 'manual' ? 'border border-[#0d6efd] bg-[#eff6ff] text-[#0d6efd]' : 'text-[#0B1F44]',
          ].join(' ')}
        >
          Manual Entry
        </button>
      </div>

      <div className="mt-4 grid gap-5 lg:mt-6 lg:grid-cols-[minmax(0,1.08fr)_auto_minmax(320px,0.86fr)] lg:gap-8">
        <div className={mobileTab === 'smart' ? 'block' : 'hidden sm:block'}>
          <div className="rounded-[24px] border border-[#bfdbfe] bg-[#F8FBFF] p-3 sm:p-5">
            <div>
              <h4 className="text-xl font-black text-[#0B1F44]">Smart Import</h4>
              <p className="mt-2 text-body-main leading-6 text-[#334155]">
                Import names, emails, and phone numbers from screenshots or pasted/uploaded images.
              </p>
              <p className="mt-2 text-body-sub font-semibold leading-5 text-[#475569]">
                Private import: your image is not shown to other players, and no email, SMS, invite, or reminder is sent unless you choose to.
              </p>
            </div>

            <div className="mt-3 sm:mt-4">
              {smartImportAvailable && onParseScreenshots && onImportScreenshotContacts ? (
                <ContactScreenshotImportSection
                  userId={userId}
                  existingContacts={existingContacts}
                  onParseScreenshots={onParseScreenshots}
                  onImportScreenshotContacts={onImportScreenshotContacts}
                  onImported={onImported}
                />
              ) : (
                <div className="rounded-2xl border border-[#D7E2F0] bg-white p-4">
                  <p className="text-body-main font-semibold text-[#475569]">
                    Smart Import is not available right now.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden items-stretch justify-center lg:flex">
          <div className="relative w-px bg-[#D7E2F0]">
            <span className="absolute left-1/2 top-10 -translate-x-1/2 rounded-full border border-[#D7E2F0] bg-white px-2 py-1 text-[10px] font-black text-[#64748B]">
              OR
            </span>
          </div>
        </div>

        <div className={mobileTab === 'manual' ? 'block' : 'hidden sm:block'}>
          <div className="rounded-[24px] border border-[#E2E8F0] bg-white p-4 sm:p-5">
            <ManualEntryForm
              displayName={displayName}
              email={email}
              phone={phone}
              notes={notes}
              creatingContact={creatingContact}
              error={error}
              onDisplayNameChange={onDisplayNameChange}
              onEmailChange={onEmailChange}
              onPhoneChange={onPhoneChange}
              onNotesChange={onNotesChange}
              onManualSubmit={onManualSubmit}
              onCancel={onCancel}
            />
          </div>
        </div>
      </div>
    </section>
  )
}
