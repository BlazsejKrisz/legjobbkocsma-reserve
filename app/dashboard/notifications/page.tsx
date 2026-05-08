import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { getServerT } from '@/lib/i18n/serverT'
import { NotificationsList } from '@/components/notifications/NotificationsList'

export default async function NotificationsPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (session.isVenueStaff) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{t.notifications.title}</h1>
        <p className="text-sm text-muted-foreground">{t.notifications.subtitle}</p>
      </div>

      <NotificationsList />
    </div>
  )
}
