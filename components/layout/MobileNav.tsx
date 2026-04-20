'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { SidebarContent } from './Sidebar'
import type { AppRole } from '@/lib/types/user'

type MobileNavProps = {
  role: AppRole
  initialOverflowCount?: number
}

export function MobileNav({ role, initialOverflowCount }: MobileNavProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded p-1.5 text-muted-foreground hover:text-foreground"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SidebarContent
            role={role}
            initialOverflowCount={initialOverflowCount}
            onClose={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
