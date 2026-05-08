'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { SidebarContent } from './Sidebar'
import type { AppRole } from '@/lib/types/user'

type MobileNavProps = {
  role: AppRole
  initialOverflowCount?: number
  canSeeOverflow?: boolean
  staffVenueId?: string
}

export function MobileNav({ role, initialOverflowCount, canSeeOverflow, staffVenueId }: MobileNavProps) {
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
          {/* Required by Radix for screen readers; visually hidden because
              the sidebar's brand area already serves as a visual heading. */}
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SidebarContent
            role={role}
            initialOverflowCount={initialOverflowCount}
            canSeeOverflow={canSeeOverflow}
            staffVenueId={staffVenueId}
            onClose={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  )
}
