'use client'

import { useState } from 'react'
import { HelpCircle, Mail, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useLang } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

// Help dialog wired through Radix (shadcn) so we get focus trap, ESC,
// scroll-lock, ARIA labelling, and focus restoration for free.  The
// previous hand-rolled overlay had none of these.
export function HelpButton() {
  const [open, setOpen] = useState(false)
  const { lang } = useLang()
  const t = translations[lang].help

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 px-2.5 text-xs font-medium"
          title={t.title}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{t.title}</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <span className="text-[11px] font-bold text-primary">BK</span>
            </div>
            <div>
              <p className="text-sm font-medium leading-tight">Blazsej Krisztián</p>
              <p className="text-[11px] text-muted-foreground">{t.role_developer}</p>
            </div>
          </div>

          <a
            href="mailto:b.krisz4@gmail.com"
            className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 hover:bg-muted/60 transition-colors group"
          >
            <Mail className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            <span className="text-sm">b.krisz4@gmail.com</span>
          </a>

          <a
            href="tel:+36204090964"
            className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3.5 py-2.5 hover:bg-muted/60 transition-colors group"
          >
            <Phone className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            <span className="text-sm">+36 20 409 0964</span>
          </a>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} className="w-full sm:w-auto">
            {t.close}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
