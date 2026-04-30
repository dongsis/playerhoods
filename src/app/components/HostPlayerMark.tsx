'use client'

interface Props {
  className?: string
}

export function HostPlayerMark({ className = '' }: Props) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-[#FDE9E2] text-[10px] font-extrabold text-[#C96C4A] shadow-[0_6px_16px_rgba(201,108,74,0.12)] ${className}`.trim()}
      aria-label="Host"
      title="Host"
    >
      H
    </span>
  )
}
