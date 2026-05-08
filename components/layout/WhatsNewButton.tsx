'use client'

import { useEffect, useState } from 'react'
import {
  Megaphone,
  MessageSquare,
  Mail,
  Bell,
  CheckCircle2,
  BarChart2,
  Search,
  Phone,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CHANGELOG, LATEST_VERSION, type ChangeIcon } from '@/lib/whatsNew/data'
import { useLang } from '@/lib/i18n/context'
import { useT } from '@/lib/i18n/useT'

const STORAGE_KEY = 'whatsNew.lastSeen'

const ICON_MAP: Record<ChangeIcon, typeof Megaphone> = {
  sms:     MessageSquare,
  email:   Mail,
  bell:    Bell,
  check:   CheckCircle2,
  chart:   BarChart2,
  search:  Search,
  phone:   Phone,
  sparkle: Sparkles,
  sliders: SlidersHorizontal,
}

export function WhatsNewButton() {
  const { lang } = useLang()
  const t = useT()
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(false)

  // Hydrate the unread indicator from localStorage on mount.  Server can't
  // read this so we render with `unread=false` initially, then update once
  // we're on the client — avoids hydration mismatches.
  useEffect(() => {
    try {
      const lastSeen = localStorage.getItem(STORAGE_KEY)
      if (lastSeen !== LATEST_VERSION) setUnread(true)
    } catch {
      // localStorage unavailable (private mode, etc) — just treat as read
    }
  }, [])

  const handleOpen = () => {
    setOpen(true)
    try {
      localStorage.setItem(STORAGE_KEY, LATEST_VERSION)
    } catch {
      // ignore
    }
    setUnread(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="relative inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/40"
        aria-label={t.whats_new.button_label}
      >
        <Megaphone className="h-3.5 w-3.5 text-primary" />
        <span className="hidden sm:inline">{t.whats_new.button_label}</span>
        {unread && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-primary" />
              {t.whats_new.dialog_title}
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-6 mt-2">
            {CHANGELOG.map((entry) => (
              <div key={entry.version} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 pb-2 border-b border-border/60">
                  <span className="text-xs font-mono text-muted-foreground tabular-nums">{entry.date}</span>
                </div>

                <ul className="flex flex-col gap-3">
                  {entry.items.map((item, idx) => {
                    const Icon = ICON_MAP[item.icon]
                    return (
                      <li key={idx} className="flex gap-3 rounded-lg border border-border/60 bg-muted/20 p-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex flex-col gap-1 min-w-0">
                          <p className="text-sm font-medium">{item.title[lang]}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {item.description[lang]}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => setOpen(false)}>
              {t.whats_new.dismiss}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
