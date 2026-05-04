'use client'

import { useLang } from './context'
import { translations } from './translations'

export function useT() {
  const { lang } = useLang()
  return translations[lang]
}
