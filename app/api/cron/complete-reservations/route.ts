import { ok, dbErr } from '@/lib/api/http'
import { checkCronAuth } from '@/lib/api/cronAuth'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const cronErr = checkCronAuth(req)
  if (cronErr) return cronErr

  const supabase = createAdminClient()
  const { data, error } = await supabase.rpc('batch_mark_reservations_completed')

  if (error) return dbErr(error, 'batch_mark_reservations_completed')

  console.log(`[cron/complete-reservations] completed ${data ?? 0} reservation(s)`)
  return ok({ completed: data ?? 0 })
}
