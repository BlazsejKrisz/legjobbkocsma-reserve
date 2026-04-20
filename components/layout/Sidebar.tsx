'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useOverflowCount } from '@/lib/hooks/overflow/useOverflow'
import {
  LayoutDashboard,
  CalendarDays,
  AlertTriangle,
  Building2,
  Users,
  X,
  CalendarRange,
  Table2,
  Tags,
  SlidersHorizontal,
  Clock,
  Plug2,
  Flame,
  Network,
  BarChart2,
  UserSquare2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AppRole } from '@/lib/types/user'

// ─── Top-level nav ────────────────────────────────────────────────────────────

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  roles: AppRole[]
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    roles: ['super_admin', 'support', 'venue_staff'],
  },
  {
    label: 'Reservations',
    href: '/dashboard/reservations',
    icon: CalendarDays,
    roles: ['super_admin', 'support', 'venue_staff'],
  },
  {
    label: 'Overflow Queue',
    href: '/dashboard/overflow',
    icon: AlertTriangle,
    roles: ['super_admin', 'support'],
  },
  {
    label: 'Venues',
    href: '/dashboard/venues',
    icon: Building2,
    roles: ['super_admin', 'support'],
  },
  {
    label: 'Users',
    href: '/dashboard/users',
    icon: Users,
    roles: ['super_admin'],
  },
  {
    label: 'Venue Groups',
    href: '/dashboard/venue-groups',
    icon: Network,
    roles: ['super_admin'],
  },
  {
    label: 'Customers',
    href: '/dashboard/customers',
    icon: UserSquare2,
    roles: ['super_admin', 'support'],
  },
  {
    label: 'Statistics',
    href: '/dashboard/stats',
    icon: BarChart2,
    roles: ['super_admin', 'support'],
  },
]

// ─── Venue sub-nav ────────────────────────────────────────────────────────────

type VenueNavItem = {
  label: string
  suffix: string
  icon: React.ElementType
  roles: AppRole[]
  exact?: boolean
}

const VENUE_NAV_ITEMS: VenueNavItem[] = [
  {
    label: 'Timeline',
    suffix: '',
    icon: CalendarRange,
    roles: ['super_admin', 'support', 'venue_staff'],
    exact: true,
  },
  {
    label: 'Reservations',
    suffix: '/reservations',
    icon: CalendarDays,
    roles: ['super_admin', 'support', 'venue_staff'],
  },
  {
    label: 'Tables',
    suffix: '/tables',
    icon: Table2,
    roles: ['super_admin', 'support', 'venue_staff'],
  },
  {
    label: 'Table types',
    suffix: '/table-types',
    icon: Tags,
    roles: ['super_admin', 'support'],
  },
  {
    label: 'Settings',
    suffix: '/settings',
    icon: SlidersHorizontal,
    roles: ['super_admin'],
  },
  {
    label: 'Open hours',
    suffix: '/open-hours',
    icon: Clock,
    roles: ['super_admin'],
  },
  {
    label: 'Integrations',
    suffix: '/integrations',
    icon: Plug2,
    roles: ['super_admin'],
  },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractVenueId(pathname: string): string | null {
  const m = pathname.match(/^\/dashboard\/venues\/([^/]+)/)
  return m ? m[1] : null
}

// ─── Nav link ─────────────────────────────────────────────────────────────────

function NavLink({
  href,
  icon: Icon,
  label,
  isActive,
  badge,
  indent = false,
  onClose,
}: {
  href: string
  icon: React.ElementType
  label: string
  isActive: boolean
  badge?: number
  indent?: boolean
  onClose?: () => void
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className={cn(
        'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-150',
        indent && 'ml-1 py-1.5 text-[13px]',
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-black/5 hover:text-foreground font-normal',
      )}
    >
      <Icon
        className={cn(
          'shrink-0 transition-colors',
          indent ? 'h-3.5 w-3.5' : 'h-4 w-4',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
        )}
      />
      <span className="flex-1 truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  )
}

// ─── Sidebar content ──────────────────────────────────────────────────────────

type SidebarProps = {
  role: AppRole
  initialOverflowCount?: number
  onClose?: () => void
}

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  support: 'Support',
  venue_staff: 'Venue Staff',
}

export function SidebarContent({ role, initialOverflowCount, onClose }: SidebarProps) {
  const { data: liveCount } = useOverflowCount(initialOverflowCount)
  const overflowCount = liveCount ?? initialOverflowCount ?? 0
  const pathname = usePathname()
  const venueId = extractVenueId(pathname)

  const visibleTopItems = NAV_ITEMS.filter((item) => item.roles.includes(role))
  const visibleVenueItems = venueId
    ? VENUE_NAV_ITEMS.filter((item) => item.roles.includes(role))
    : []

  return (
    <div className="flex h-full flex-col bg-sidebar">
      {/* Brand header */}
      <div className="flex items-center justify-between px-4 py-4">
        <Link
          href="/dashboard"
          onClick={onClose}
          className="flex items-center gap-2.5 group"
        >
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Legjobb<span className="text-primary">Kocsma</span>
          </span>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-border/60" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {visibleTopItems.map((item) => {
          const isOverflow = item.href === '/dashboard/overflow'
          const isActive =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href)

          return (
            <NavLink
              key={item.href}
              href={item.href}
              icon={item.icon}
              label={item.label}
              isActive={isActive}
              badge={isOverflow ? overflowCount : undefined}
              onClose={onClose}
            />
          )
        })}

        {/* Venue sub-nav */}
        {venueId && visibleVenueItems.length > 0 && (
          <div className="mt-4 pt-3 border-t border-border/60">
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Venue
            </p>
            <div className="space-y-0.5">
              {visibleVenueItems.map((item) => {
                const href = `/dashboard/venues/${venueId}${item.suffix}`
                const isActive = item.exact
                  ? pathname === href
                  : pathname.startsWith(href)

                return (
                  <NavLink
                    key={item.suffix}
                    href={href}
                    icon={item.icon}
                    label={item.label}
                    isActive={isActive}
                    indent
                    onClose={onClose}
                  />
                )
              })}
            </div>
          </div>
        )}
      </nav>

      {/* Role badge */}
      <div className="mx-4 mb-4 mt-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-[11px] font-medium text-muted-foreground">
            {ROLE_LABELS[role]}
          </span>
        </div>
      </div>
    </div>
  )
}
