import { ok, err, safeJson, dbErr } from '@/lib/api/http'
import { requireVenueAccess, requireSuperAdmin } from '@/lib/api/authz'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { UpdateVenueSchema } from '@/lib/validators/venues'
import {
  VENUE_LOGOS_BUCKET,
  isVenueLogoStorageUrl,
  getVenueLogoStoragePath,
} from '@/lib/api/storage'

type Params = { params: Promise<{ venueId: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireVenueAccess(venueId)
  if (!auth.ok) return auth.response

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('venues')
    .select('id, name, slug, is_active, allowed_origins, address, phone, website, email_contact, logo_url, created_at')
    .eq('id', venueId)
    .single()

  if (error) return dbErr(error)

  return ok({ data })
}

export async function PATCH(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await safeJson(req)
  const parsed = UpdateVenueSchema.safeParse(body)
  if (!parsed.success) {
    return err('Invalid payload', { status: 400, details: parsed.error.flatten() })
  }

  const supabase = await createClient()

  // If the logo is changing, fetch the previous value so we can delete the
  // old uploaded file from storage after the update succeeds.
  let oldLogoUrl: string | null = null
  if ('logo_url' in parsed.data) {
    const { data: prev } = await supabase
      .from('venues')
      .select('logo_url')
      .eq('id', venueId)
      .single()
    oldLogoUrl = prev?.logo_url ?? null
  }

  const { error } = await supabase
    .from('venues')
    .update(parsed.data)
    .eq('id', venueId)

  if (error) return dbErr(error)

  if (
    'logo_url' in parsed.data &&
    oldLogoUrl &&
    oldLogoUrl !== parsed.data.logo_url &&
    isVenueLogoStorageUrl(oldLogoUrl)
  ) {
    const oldPath = getVenueLogoStoragePath(oldLogoUrl)
    if (oldPath) {
      const admin = createAdminClient()
      await admin.storage.from(VENUE_LOGOS_BUCKET).remove([oldPath])
    }
  }

  return ok({ success: true })
}
