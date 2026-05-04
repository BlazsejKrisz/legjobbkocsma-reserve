import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getSession } from '@/lib/auth/getSession'
import { getVenue, getVenueIntegrations } from '@/lib/data/venues'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { OutboxDashboard } from '@/components/integrations/OutboxDashboard'
import { getServerT } from '@/lib/i18n/serverT'

type Params = { params: Promise<{ venueId: string }> }

export default async function IntegrationsPage({ params }: Params) {
  const { venueId } = await params
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect(`/dashboard/venues/${venueId}`)

  const [venue, integrations, t] = await Promise.all([
    getVenue(venueId),
    getVenueIntegrations(venueId),
    getServerT(),
  ])
  if (!venue) notFound()

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7" asChild>
          <Link href={`/dashboard/venues/${venueId}`}>
            <ChevronLeft className="h-3.5 w-3.5" />
            {venue.name}
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-lg font-semibold">{t.integrations_page.title}</h1>
        <p className="text-sm text-muted-foreground">{venue.name}</p>
      </div>

      {integrations.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t.integrations_page.configured}
          </h2>
          {integrations.map((intg) => (
            <Card key={intg.id} className="bg-muted/30 border-border">
              <CardHeader className="pb-2 pt-3 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium capitalize">{intg.provider}</CardTitle>
                  <Badge
                    className={
                      intg.is_enabled
                        ? 'bg-emerald-500/15 text-emerald-400 text-[10px]'
                        : 'bg-zinc-500/15 text-zinc-400 text-[10px]'
                    }
                  >
                    {intg.is_enabled ? t.integrations_page.enabled : t.integrations_page.disabled}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-3 pt-0 space-y-1">
                {intg.external_location_id && (
                  <p className="text-[11px] text-muted-foreground">
                    {t.integrations_page.location_id} <span className="font-mono">{intg.external_location_id}</span>
                  </p>
                )}
                {intg.config && Object.keys(intg.config).length > 0 && (
                  <pre className="text-[11px] text-muted-foreground overflow-x-auto">
                    {JSON.stringify(intg.config, null, 2)}
                  </pre>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {integrations.length === 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {t.integrations_page.available}
          </h2>
          <Card className="bg-muted/20 border-dashed border-border">
            <CardHeader className="pb-2 pt-3 px-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Fruit</CardTitle>
                <Badge className="bg-zinc-500/15 text-zinc-400 text-[10px]">{t.integrations_page.not_configured}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-3 pt-0">
              <p className="text-xs text-muted-foreground">
                {t.integrations_page.fruit_desc}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Separator />

      <OutboxDashboard venueId={venueId} />
    </div>
  )
}
