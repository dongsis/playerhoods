import Link from 'next/link'

type BrandLogoVariant = 'mark' | 'horizontal' | 'stacked'

const LOGO_SRC: Record<BrandLogoVariant, string> = {
  mark: '/playerhoods-brand-mark-cropped.png',
  horizontal: '/playerhoods-brand-horizontal-cropped.png',
  stacked: '/playerhoods-brand-stacked-cropped.png',
}

const SIZE_CLASS: Record<BrandLogoVariant, string> = {
  mark: 'h-11 w-11',
  horizontal: 'h-11 w-[190px]',
  stacked: 'h-16 w-[150px]',
}

export function BrandLogo({
  variant = 'horizontal',
  href = '/',
  className = '',
  imageClassName = '',
}: {
  variant?: BrandLogoVariant
  href?: string
  className?: string
  imageClassName?: string
}) {
  return (
    <Link
      href={href}
      className={['inline-flex items-center justify-start', className].filter(Boolean).join(' ')}
      aria-label="PlayerHoods home"
    >
      <img
        src={LOGO_SRC[variant]}
        alt=""
        className={[
          SIZE_CLASS[variant],
          'object-contain',
          imageClassName,
        ].filter(Boolean).join(' ')}
      />
    </Link>
  )
}
