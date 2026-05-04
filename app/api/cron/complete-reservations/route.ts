import { ok, err } from '@/lib/api/http'
import { createAdminClient } from '@/lib/supabase/server'

/**
 * Auto-complete cron — marks confirmed reservations as completed
 * once their end time has passed.
 * Called by Vercel Cron every hour.
 * Auth: CRON_SECRET header.
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return err('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'completed' })
    .eq('status', 'confirmed')
    .lt('ends_at', new Date().toISOString())
    .select('id')

  if (error) {
    console.error('[cron/complete-reservations] update failed', error)
    return err('DB error', { status: 500 })
  }

  console.log(`[cron/complete-reservations] completed ${data?.length ?? 0} reservation(s)`)
  return ok({ completed: data?.length ?? 0 })
}
