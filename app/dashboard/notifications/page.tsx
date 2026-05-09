import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { getServerT } from '@/lib/i18n/serverT'
import { NotificationsList } from '@/components/notifications/NotificationsList'
import { PageHeader } from '@/components/layout/PageHeader'

export default async function NotificationsPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (session.isVenueStaff) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.notifications.title} subtitle={t.notifications.subtitle} />
      <NotificationsList />
    </div>
  )
}
