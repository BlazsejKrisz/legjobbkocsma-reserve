'use client'

import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function LogoutButton() {
  const router = useRouter()
  const t = useT()

  const logout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return <Button onClick={logout}>{t.common.logout}</Button>
}
