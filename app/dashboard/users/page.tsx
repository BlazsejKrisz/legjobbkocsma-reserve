import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { UsersList } from '@/components/users/UsersList'
import { PageHeader } from '@/components/layout/PageHeader'
import { getServerT } from '@/lib/i18n/serverT'

export default async function UsersPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.users.title} subtitle={t.users.subtitle} />
      <UsersList />
    </div>
  )
}
