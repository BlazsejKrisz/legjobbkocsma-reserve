// Helpers for the venue-logos storage bucket.
// Bucket name kept in one place so URL parsing/path extraction stays consistent.

export const VENUE_LOGOS_BUCKET = 'venue-logos'

const PUBLIC_PREFIX = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${VENUE_LOGOS_BUCKET}/`

export function isVenueLogoStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return url.startsWith(PUBLIC_PREFIX)
}

export function getVenueLogoStoragePath(url: string): string | null {
  if (!isVenueLogoStorageUrl(url)) return null
  return url.slice(PUBLIC_PREFIX.length)
}

export function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png':     return 'png'
    case 'image/jpeg':    return 'jpg'
    case 'image/webp':    return 'webp'
    case 'image/svg+xml': return 'svg'
    default:              return 'bin'
  }
}
