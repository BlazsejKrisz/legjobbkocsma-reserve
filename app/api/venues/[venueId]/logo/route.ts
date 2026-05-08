import { ok, err, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import {
  VENUE_LOGOS_BUCKET,
  isVenueLogoStorageUrl,
  getVenueLogoStoragePath,
  mimeToExt,
} from '@/lib/api/storage'

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const MAX_BYTES = 2 * 1024 * 1024

type Params = { params: Promise<{ venueId: string }> }

export async function POST(req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const formData = await req.formData().catch(() => null)
  if (!formData) return err('Invalid form data', { status: 400 })

  const file = formData.get('file')
  if (!(file instanceof File)) return err('Missing file', { status: 400 })

  if (!ALLOWED_MIME.has(file.type)) {
    return err(`Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPEG, WebP, or SVG.`, {
      status: 400,
    })
  }
  if (file.size === 0) return err('File is empty', { status: 400 })
  if (file.size > MAX_BYTES) return err('File too large (max 2MB)', { status: 400 })

  const admin = createAdminClient()

  const { data: venueRow, error: fetchErr } = await admin
    .from('venues')
    .select('logo_url')
    .eq('id', venueId)
    .single()
  if (fetchErr) return dbErr(fetchErr)

  const oldUrl = venueRow?.logo_url ?? null
  const path = `${venueId}/${Date.now()}.${mimeToExt(file.type)}`
  const buffer = await file.arrayBuffer()

  const { error: uploadErr } = await admin.storage
    .from(VENUE_LOGOS_BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false })
  if (uploadErr) return err(`Upload failed: ${uploadErr.message}`, { status: 500 })

  const { data: { publicUrl } } = admin.storage.from(VENUE_LOGOS_BUCKET).getPublicUrl(path)

  const { error: updateErr } = await admin
    .from('venues')
    .update({ logo_url: publicUrl })
    .eq('id', venueId)
  if (updateErr) {
    await admin.storage.from(VENUE_LOGOS_BUCKET).remove([path])
    return dbErr(updateErr)
  }

  if (oldUrl && isVenueLogoStorageUrl(oldUrl)) {
    const oldPath = getVenueLogoStoragePath(oldUrl)
    if (oldPath && oldPath !== path) {
      await admin.storage.from(VENUE_LOGOS_BUCKET).remove([oldPath])
    }
  }

  return ok({ logo_url: publicUrl })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { venueId } = await params
  const auth = await requireSuperAdmin()
  if (!auth.ok) return auth.response

  const admin = createAdminClient()

  const { data: venueRow, error: fetchErr } = await admin
    .from('venues')
    .select('logo_url')
    .eq('id', venueId)
    .single()
  if (fetchErr) return dbErr(fetchErr)

  const oldUrl = venueRow?.logo_url ?? null

  const { error: updateErr } = await admin
    .from('venues')
    .update({ logo_url: null })
    .eq('id', venueId)
  if (updateErr) return dbErr(updateErr)

  if (oldUrl && isVenueLogoStorageUrl(oldUrl)) {
    const oldPath = getVenueLogoStoragePath(oldUrl)
    if (oldPath) {
      await admin.storage.from(VENUE_LOGOS_BUCKET).remove([oldPath])
    }
  }

  return ok({ success: true })
}
