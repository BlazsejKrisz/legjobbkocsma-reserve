import { cookies } from 'next/headers'
import { translations } from './translations'

export async function getServerT() {
  const store = await cookies()
  const lang = store.get('lang')?.value === 'hu' ? 'hu' : 'en'
  return translations[lang]
}
