import { ok, err, dbErr } from '@/lib/api/http'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return err('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('batch_mark_reservations_completed')

  if (error) return dbErr(error, 'batch_mark_reservations_completed')

  console.log(`[cron/complete-reservations] completed ${data ?? 0} reservation(s)`)
  return ok({ completed: data ?? 0 })
}
