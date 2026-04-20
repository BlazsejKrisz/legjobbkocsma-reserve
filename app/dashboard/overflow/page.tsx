import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { OverflowQueue } from '@/components/overflow/OverflowQueue'
import { Info } from 'lucide-react'

export default async function OverflowPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')

  // Only support and super_admin can access overflow queue globally
  if (session.isVenueStaff) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Manual Review Queue</h1>
        <p className="text-sm text-muted-foreground">
          Reservations land here when the system cannot automatically assign a table —
          for example, because the venue is fully booked, the party is too large for any
          single available table, or the requested time falls outside open hours.
          Each item needs a human decision: either reassign it to a different table,
          venue, or time slot, or cancel it.
        </p>
      </div>

      {/* How-to callout */}
      <div className="flex gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
        <div className="text-xs text-blue-300/90 space-y-1">
          <p className="font-semibold text-blue-200">How to handle an overflow reservation</p>
          <ol className="list-decimal list-inside space-y-0.5 text-blue-300/80">
            <li>Click <strong>Reassign</strong> to open the reassignment tool.</li>
            <li>Pick a suggested option (different venue or time slot) — or switch to <strong>Manual pick</strong> to choose tables yourself.</li>
            <li>Optionally tick <strong>Send confirmation email</strong> so the customer is notified of the new details.</li>
            <li>Click <strong>Confirm reassignment</strong> to finalise.</li>
          </ol>
          <p className="text-blue-300/60 pt-1">
            If none of the options work, you can cancel the reservation directly from this table —
            make sure to follow up with the customer separately.
          </p>
        </div>
      </div>

      <OverflowQueue />
    </div>
  )
}
