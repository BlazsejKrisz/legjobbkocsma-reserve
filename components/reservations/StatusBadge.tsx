import { cn } from '@/lib/utils'
import { STATUS_CLASSES, STATUS_LABELS } from '@/lib/domain/reservation'
import type { ReservationStatus } from '@/lib/types/reservation'

type Props = {
  status: ReservationStatus
  className?: string
}

export function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        STATUS_CLASSES[status] ?? 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
        className,
      )}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
