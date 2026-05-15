import type { Sport } from '@/lib/types/database'

type SportLike = Pick<Sport, 'code' | 'display_name'> | null | undefined

export function isPickleballSport(sport: SportLike) {
  const value = `${sport?.code ?? ''} ${sport?.display_name ?? ''}`.toLowerCase()
  return value.includes('pickle')
}

export function TennisBallIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span className={['relative inline-block overflow-hidden rounded-full bg-[#C9D400]', className].join(' ')} aria-hidden="true">
      <span className="absolute -left-[18%] top-[-12%] h-[124%] w-[55%] rounded-full border-r-2 border-white/95" />
      <span className="absolute -right-[18%] bottom-[-12%] h-[124%] w-[55%] rounded-full border-l-2 border-white/95" />
    </span>
  )
}

export function PickleballIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span className={['relative inline-block overflow-hidden rounded-full bg-[#C9D400]', className].join(' ')} aria-hidden="true">
      <span className="absolute left-[23%] top-[22%] h-[20%] w-[20%] rounded-full bg-white/95" />
      <span className="absolute right-[22%] top-[24%] h-[20%] w-[20%] rounded-full bg-white/95" />
      <span className="absolute left-[18%] bottom-[25%] h-[20%] w-[20%] rounded-full bg-white/95" />
      <span className="absolute right-[18%] bottom-[22%] h-[20%] w-[20%] rounded-full bg-white/95" />
      <span className="absolute left-[40%] top-[42%] h-[22%] w-[22%] rounded-full bg-white/95" />
    </span>
  )
}

export function SportBallIcon({
  sport,
  className = 'h-5 w-5',
}: {
  sport: SportLike
  className?: string
}) {
  return isPickleballSport(sport) ? <PickleballIcon className={className} /> : <TennisBallIcon className={className} />
}

export function SportSectionIcon({
  sport,
  className = '',
}: {
  sport: SportLike
  className?: string
}) {
  return (
    <span
      className={[
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F7FBDE] shadow-[0_8px_18px_rgba(201,212,0,0.18)]',
        className,
      ].join(' ')}
      aria-hidden="true"
    >
      <SportBallIcon sport={sport} className="h-5 w-5" />
    </span>
  )
}
