'use client'

type Props = {
  className?: string
  title?: string
  variant?: 'avatar' | 'badge'
}

export function ContactPlayerMark({
  className = 'h-8 w-8',
  title = 'Contact player',
  variant = 'avatar',
}: Props) {
  const outerStroke = variant === 'badge' ? '#CBD5E1' : '#CBD5E1'
  const innerFill = variant === 'badge' ? '#E2E8F0' : '#CBD5E1'
  const textFill = '#334155'

  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-label={title}
    >
      <circle cx="60" cy="60" r="59" fill="white" stroke={outerStroke} strokeWidth="1" />
      <circle cx="60" cy="60" r="52" fill={innerFill} />
      <text
        x="62"
        y="64"
        fill={textFill}
        fontSize={variant === 'badge' ? '54' : '58'}
        fontFamily="Georgia, serif"
        fontStyle="italic"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        C
      </text>
    </svg>
  )
}
