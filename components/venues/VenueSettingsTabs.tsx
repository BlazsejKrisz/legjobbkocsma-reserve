'use client'

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { VenueSettingsForm } from './VenueSettingsForm'
import { VenueBrandingEditor } from './VenueBrandingEditor'
import { AllowedOriginsEditor } from './AllowedOriginsEditor'

export function VenueSettingsTabs({ venueId }: { venueId: string }) {
  return (
    <Tabs defaultValue="general">
      <TabsList className="mb-6">
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="branding">Branding</TabsTrigger>
        <TabsTrigger value="api">API & CORS</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <VenueSettingsForm venueId={venueId} />
      </TabsContent>

      <TabsContent value="branding" className="max-w-2xl">
        <VenueBrandingEditor venueId={venueId} />
      </TabsContent>

      <TabsContent value="api" className="max-w-2xl">
        <AllowedOriginsEditor venueId={venueId} />
      </TabsContent>
    </Tabs>
  )
}
