import { redirect } from 'next/navigation'

type Params = { params: Promise<{ venueId: string }> }

export default async function ResourcesRedirectPage({ params }: Params) {
  const { venueId } = await params
  redirect(`/dashboard/venues/${venueId}/tables`)
}
