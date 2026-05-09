import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { CustomerList } from '@/components/customers/CustomerList'
import { PageHeader } from '@/components/layout/PageHeader'
import { getServerT } from '@/lib/i18n/serverT'

export default async function CustomersPage() {
  const [session, t] = await Promise.all([getSession(), getServerT()])
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin && !session.isSupport) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.customers.title} subtitle={t.customers.subtitle} />
      <CustomerList />
    </div>
  )
}
