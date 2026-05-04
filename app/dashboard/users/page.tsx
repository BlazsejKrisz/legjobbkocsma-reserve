import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { UsersList } from '@/components/users/UsersList'
import { getServerT } from '@/lib/i18n/serverT'

export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect('/dashboard')

  const t = await getServerT()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">{t.users.title}</h1>
        <p className="text-sm text-muted-foreground">{t.users.subtitle}</p>
      </div>

      <UsersList />
    </div>
  )
}
