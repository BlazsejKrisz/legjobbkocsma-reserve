'use client'

import { useRouter } from 'next/navigation'
import { useLang } from '@/lib/i18n/context'

export function LanguageSwitcher() {
  const { lang, setLang } = useLang()
  const router = useRouter()

  const toggle = () => {
    setLang(lang === 'en' ? 'hu' : 'en')
    router.refresh()
  }

  return (
    <button
      onClick={toggle}
      className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground border border-border hover:text-foreground hover:border-foreground/30 transition-colors tabular-nums"
      title={lang === 'en' ? 'Switch to Hungarian' : 'Switch to English'}
    >
      {lang === 'en' ? 'HU' : 'EN'}
    </button>
  )
}
