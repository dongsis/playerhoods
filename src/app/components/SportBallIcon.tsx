import type { Sport } from '@/lib/types/database'

type SportLike = Pick<Sport, 'code' | 'display_name'> | null | undefined

export function isPickleballSport(sport: SportLike) {
  const value = `${sport?.code ?? ''} ${sport?.display_name ?? ''}`.toLowerCase()
  return value.includes('pickle')
}

export function TennisBallIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span className={['relative inline-block overflow-hidden rounded-full bg-[#D4EA00]', className].join(' ')} aria-hidden="true">
      <span className="absolute -left-[19%] top-[5%] h-[90%] w-[42%] rounded-full border-r-[3px] border-white" />
      <span className="absolute -right-[19%] top-[5%] h-[90%] w-[42%] rounded-full border-l-[3px] border-white" />
    </span>
  )
}

export function PickleballIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <span className={['relative inline-block overflow-hidden rounded-full bg-[#D4EA00]', className].join(' ')} aria-hidden="true">
      <span className="absolute left-[24%] top-[10%] h-[13%] w-[13%] rounded-full bg-white" />
      <span className="absolute right-[24%] top-[10%] h-[13%] w-[13%] rounded-full bg-white" />
      <span className="absolute left-[45%] top-[24%] h-[14%] w-[14%] rounded-full bg-white" />
      <span className="absolute left-[20%] top-[42%] h-[15%] w-[15%] rounded-full bg-white" />
      <span className="absolute right-[20%] top-[42%] h-[15%] w-[15%] rounded-full bg-white" />
      <span className="absolute left-[7%] top-[55%] h-[13%] w-[13%] rounded-full bg-white" />
      <span className="absolute right-[7%] top-[55%] h-[13%] w-[13%] rounded-full bg-white" />
      <span className="absolute left-[43%] top-[55%] h-[17%] w-[17%] rounded-full bg-white" />
      <span className="absolute left-[25%] bottom-[12%] h-[14%] w-[14%] rounded-full bg-white" />
      <span className="absolute right-[25%] bottom-[12%] h-[14%] w-[14%] rounded-full bg-white" />
      <span className="absolute left-[45%] bottom-[2%] h-[15%] w-[15%] rounded-full bg-white" />
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
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFFDF3] shadow-[0_8px_18px_rgba(212,234,0,0.18)]',
        className,
      ].join(' ')}
      aria-hidden="true"
    >
      <SportBallIcon sport={sport} className="h-6 w-6" />
    </span>
  )
}
