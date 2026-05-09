import { ok, err, dbErr } from '@/lib/api/http'
import { requireSuperAdmin } from '@/lib/api/authz'
import { createAdminClient } from '@/lib/supabase/server'
import { invalidate } from '@/lib/data/invalidate'
import {
  VENUE_LOGOS_BUCKET,
  isVenueLogoStorageUrl,
  getVenueLogoStoragePath,
  mimeToExt,
} from '@/lib/api/storage'

// SVG is intentionally NOT supported.  Stored XSS via SVG is a classic
// browser exploit: an SVG file served from the same origin can contain
// `<script>` and execute when rendered as <img> via blob/data URLs or when
// hot-linked into a content area.  Even with CSP, locking down PNG/JPEG/
// WebP keeps the blast radius minimal.
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_BYTES = 2 * 1024 * 1024

// Magic-byte signatures for the formats we accept.  Sniffing prevents an
// attacker from lying about content-type — e.g. uploading an HTML file
// with `Content-Type: image/png`.
function sniffImageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
    return 'image/webp'
  }
  return null
}

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
    return err(`Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPEG, or WebP.`, {
      status: 400,
    })
  }
  if (file.size === 0) return err('File is empty', { status: 400 })
  if (file.size > MAX_BYTES) return err('File too large (max 2MB)', { status: 400 })

  const buffer = await file.arrayBuffer()
  const head = new Uint8Array(buffer.slice(0, 16))
  const sniffed = sniffImageMime(head)
  if (!sniffed) {
    return err('File content does not match an allowed image format', { status: 400 })
  }
  // Use the sniffed mime, not the browser-supplied one — never serve back
  // a content-type the user got to choose.
  const trustedMime: 'image/png' | 'image/jpeg' | 'image/webp' = sniffed

  const admin = createAdminClient()

  const { data: venueRow, error: fetchErr } = await admin
    .from('venues')
    .select('logo_url')
    .eq('id', venueId)
    .single()
  if (fetchErr) return dbErr(fetchErr)

  const oldUrl = venueRow?.logo_url ?? null
  const path = `${venueId}/${Date.now()}.${mimeToExt(trustedMime)}`

  const { error: uploadErr } = await admin.storage
    .from(VENUE_LOGOS_BUCKET)
    .upload(path, buffer, { contentType: trustedMime, upsert: false })
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

  invalidate.venue(venueId)

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

  invalidate.venue(venueId)

  return ok({ success: true })
}
