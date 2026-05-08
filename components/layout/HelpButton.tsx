'use client'

import { useState } from 'react'
import { HelpCircle, Mail, Phone, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function HelpButton() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground border border-border hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1"
        title="Segítség / Support"
      >
        <HelpCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Segítség</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-sm mx-4 rounded-xl border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="text-base font-semibold mb-1">Segítség</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Ha bármilyen hibát tapasztalsz, észrevételed vagy kérdésed van, keress bátran:
            </p>

            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <span className="text-xs font-bold text-primary">BK</span>
                </div>
                <div>
                  <p className="text-sm font-medium">Blazsej Krisztián</p>
                  <p className="text-xs text-muted-foreground">Fejlesztő</p>
                </div>
              </div>

              <a
                href="mailto:b.krisz4@gmail.com"
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 hover:bg-muted/60 transition-colors group"
              >
                <Mail className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                <span className="text-sm">b.krisz4@gmail.com</span>
              </a>

              <a
                href="tel:+36204090964"
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 hover:bg-muted/60 transition-colors group"
              >
                <Phone className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
                <span className="text-sm">+36 20 409 0964</span>
              </a>
            </div>

            <Button
              className="mt-5 w-full"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Bezárás
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
