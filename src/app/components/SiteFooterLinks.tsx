import Link from 'next/link'
import { SUPPORT_EMAIL } from '@/lib/legal'

export function SiteFooterLinks() {
  return (
    <footer className="border-t border-[#D7E0EC] bg-white/80 px-4 py-4 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-[#64748B]">
        <Link href="/terms" className="transition hover:text-[#0d6efd]">
          Terms of Use
        </Link>
        <Link href="/privacy" className="transition hover:text-[#0d6efd]">
          Privacy Notice
        </Link>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="transition hover:text-[#0d6efd]">
          Contact
        </a>
      </div>
    </footer>
  )
}
