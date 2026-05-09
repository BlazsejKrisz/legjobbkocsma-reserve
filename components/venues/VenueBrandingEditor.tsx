'use client'

import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Upload, Link2, Trash2, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { qk } from '@/lib/query/keys'
import { apiFetch } from '@/lib/types/api'
import {
  useUpdateVenueBranding,
  useUploadVenueLogo,
  useDeleteVenueLogo,
} from '@/lib/hooks/venues/useVenues'
import { isVenueLogoStorageUrl } from '@/lib/api/storage'
import { useT } from '@/lib/i18n/useT'
import type { Venue } from '@/lib/types/venue'

// SVG was removed from the upload allowed mimes in migration of the
// /api/venues/[venueId]/logo route (XSS via stored SVG).  Mirror that
// here so the file picker doesn't suggest something that will fail.
const ACCEPT = 'image/png,image/jpeg,image/webp'

export function VenueBrandingEditor({ venueId }: { venueId: string }) {
  const t = useT()
  const { data, isLoading } = useQuery({
    queryKey: qk.venues.detail(venueId),
    queryFn: () => apiFetch<{ data: Venue }>(`/api/venues/${venueId}`),
  })

  const venue = data?.data
  const updateBranding = useUpdateVenueBranding(venueId)
  const uploadLogo = useUploadVenueLogo(venueId)
  const deleteLogo = useDeleteVenueLogo(venueId)

  const [logoUrl, setLogoUrl] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [emailContact, setEmailContact] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!venue) return
    setLogoUrl(venue.logo_url ?? '')
    setAddress(venue.address ?? '')
    setPhone(venue.phone ?? '')
    setWebsite(venue.website ?? '')
    setEmailContact(venue.email_contact ?? '')
  }, [venue])

  const currentLogo = venue?.logo_url ?? null
  const isUploaded = isVenueLogoStorageUrl(currentLogo)

  const handleSaveBranding = () => {
    updateBranding.mutate({
      address: address || null,
      phone: phone || null,
      website: website || null,
      email_contact: emailContact || null,
    })
  }

  const handleSaveUrl = () => {
    updateBranding.mutate({ logo_url: logoUrl || null })
  }

  const handleFile = (file: File | null | undefined) => {
    if (!file) return
    uploadLogo.mutate(file, {
      onSettled: () => {
        if (fileInputRef.current) fileInputRef.current.value = ''
      },
    })
  }

  const handleRemoveLogo = () => {
    if (isUploaded) {
      deleteLogo.mutate()
    } else {
      updateBranding.mutate({ logo_url: null })
    }
  }

  const isContactDirty =
    (address || null) !== (venue?.address ?? null) ||
    (phone || null) !== (venue?.phone ?? null) ||
    (website || null) !== (venue?.website ?? null) ||
    (emailContact || null) !== (venue?.email_contact ?? null)

  const isUrlDirty = (logoUrl || null) !== (currentLogo ?? null)

  if (isLoading) return null

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-sm font-semibold">{t.venue_branding.title}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t.venue_branding.title_subtitle}
        </p>
      </div>

      {/* Logo */}
      <div className="flex flex-col gap-3">
        <Label className="text-xs">{t.venue_branding.logo_label}</Label>

        {/* Preview / current state */}
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex h-14 w-24 items-center justify-center rounded bg-zinc-800 overflow-hidden shrink-0">
            {currentLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentLogo}
                alt="Logo preview"
                className="max-h-12 max-w-full object-contain"
              />
            ) : (
              <ImageIcon className="h-5 w-5 text-zinc-600" />
            )}
          </div>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <p className="text-xs font-medium">
              {currentLogo
                ? isUploaded ? t.venue_branding.logo_uploaded : t.venue_branding.logo_external
                : t.venue_branding.logo_none}
            </p>
            {currentLogo && (
              <p className="text-[11px] text-muted-foreground truncate font-mono">
                {currentLogo}
              </p>
            )}
          </div>
          {currentLogo && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleRemoveLogo}
              disabled={deleteLogo.isPending || updateBranding.isPending}
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
              {t.venue_branding.logo_remove}
            </Button>
          )}
        </div>

        {/* Two ways to set a logo — only one is active at a time */}
        <Tabs defaultValue={isUploaded || !currentLogo ? 'upload' : 'url'}>
          <TabsList>
            <TabsTrigger value="upload">
              <Upload className="h-3.5 w-3.5" />
              {t.venue_branding.tab_upload}
            </TabsTrigger>
            <TabsTrigger value="url">
              <Link2 className="h-3.5 w-3.5" />
              {t.venue_branding.tab_url}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="pt-3">
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT}
                onChange={(e) => handleFile(e.target.files?.[0])}
                disabled={uploadLogo.isPending}
                className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
              />
              <p className="text-[11px] text-muted-foreground">
                {t.venue_branding.logo_hint}
              </p>
              {uploadLogo.isPending && (
                <p className="text-[11px] text-muted-foreground">{t.venue_branding.logo_uploading}</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="url" className="pt-3">
            <div className="flex flex-col gap-2">
              <Input
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="text-sm h-8 font-mono"
              />
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {t.venue_branding.logo_url_hint}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSaveUrl}
                  disabled={updateBranding.isPending || !isUrlDirty}
                >
                  {updateBranding.isPending ? t.venue_branding.saving : t.venue_branding.logo_use_url}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Contact fields */}
      <div className="flex flex-col gap-3">
        <Label className="text-xs">{t.venue_branding.contact_details}</Label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">{t.venue_branding.address_label}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t.venue_branding.address_placeholder}
              className="text-sm h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">{t.venue_branding.phone_label}</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.venue_branding.phone_placeholder}
              className="text-sm h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">{t.venue_branding.website_label}</Label>
            <Input
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder={t.venue_branding.website_placeholder}
              className="text-sm h-8"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-[11px] text-muted-foreground">{t.venue_branding.email_contact_label}</Label>
            <Input
              value={emailContact}
              onChange={(e) => setEmailContact(e.target.value)}
              placeholder={t.venue_branding.email_contact_placeholder}
              type="email"
              className="text-sm h-8"
            />
          </div>
        </div>
      </div>

      <div>
        <Button
          size="sm"
          onClick={handleSaveBranding}
          disabled={updateBranding.isPending || !isContactDirty}
        >
          {updateBranding.isPending ? t.venue_branding.saving : t.venue_branding.save}
        </Button>
      </div>
    </div>
  )
}
