import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { UsersList } from '@/components/users/UsersList'


export default async function UsersPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold">Users</h1>
        <p className="text-sm text-muted-foreground">Manage user roles and venue access</p>
      </div>

      <UsersList />
    </div>
  )
}
