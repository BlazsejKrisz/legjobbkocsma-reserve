import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/getSession'
import { CustomerList } from '@/components/customers/CustomerList'

export default async function CustomersPage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.isSuperAdmin && !session.isSupport) redirect('/dashboard')

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">Customers</h1>
        <p className="text-sm text-muted-foreground">
          Every guest who has made a reservation is saved here automatically. Search by name,
          email, or phone number. Click a customer to see their full reservation history,
          contact details, and aggregate stats.
        </p>
      </div>
      <CustomerList />
    </div>
  )
}
