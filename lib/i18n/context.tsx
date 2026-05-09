'use client'

import { createContext, useContext, useState, useEffect } from 'react'

export type Lang = 'en' | 'hu'

const LangContext = createContext<{
  lang: Lang
  setLang: (l: Lang) => void
}>({ lang: 'en', setLang: () => {} })

function getLangCookie(): Lang {
  if (typeof document === 'undefined') return 'en'
  const val = document.cookie.split('; ').find((r) => r.startsWith('lang='))?.split('=')[1]
  return val === 'hu' ? 'hu' : 'en'
}

function setLangCookie(l: Lang) {
  const expires = new Date()
  expires.setFullYear(expires.getFullYear() + 1)
  document.cookie = `lang=${l}; expires=${expires.toUTCString()}; path=/; SameSite=Lax`
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en')

  // Hydrate from cookie on mount + sync the document <html lang> so
  // assistive tech and translation extensions see the active language.
  // Doing this in an effect (rather than reading cookies in the server
  // layout) keeps the layout cache-eligible for Next 16 cacheComponents.
  useEffect(() => {
    const fromCookie = getLangCookie()
    setLangState(fromCookie)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = fromCookie
    }
  }, [])

  const setLang = (l: Lang) => {
    setLangCookie(l)
    setLangState(l)
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l
    }
  }

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>
}

export function useLang() {
  return useContext(LangContext)
}
