'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUsers, useAssignRole, useAssignVenue, useRemoveVenue } from '@/lib/hooks/users/useUsers'
import { useVenues } from '@/lib/hooks/venues/useVenues'
import type { AppRole } from '@/lib/types/user'

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: 'Super Admin',
  support: 'Support',
  venue_staff: 'Venue Staff',
}

const ROLE_BADGE_CLASSES: Record<AppRole, string> = {
  super_admin: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  support: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  venue_staff: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
}

export function UsersList() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const { data: usersData, isLoading } = useUsers()
  const { data: venuesData } = useVenues()
  const assignRole = useAssignRole()
  const assignVenue = useAssignVenue()
  const removeVenue = useRemoveVenue()

  const users = usersData?.data ?? []
  const venues = venuesData?.data ?? []

  return (
    <div className="rounded-md border border-border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="h-9">
            <TableHead className="text-xs">User</TableHead>
            <TableHead className="text-xs">Roles</TableHead>
            <TableHead className="text-xs">Venues</TableHead>
            <TableHead className="text-xs">Status</TableHead>
            <TableHead className="text-xs text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading && Array.from({ length: 5 }).map((_, i) => (
            <TableRow key={i} className="h-10">
              <TableCell colSpan={5}>
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
              </TableCell>
            </TableRow>
          ))}

          {!isLoading && users.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                No users found.
              </TableCell>
            </TableRow>
          )}

          {users.map((user) => {
            const isExpanded = expandedId === user.id
            return (
              <>
                <TableRow key={user.id} className="h-10">
                  <TableCell className="text-sm">
                    <p className="font-medium">{user.full_name ?? 'Unknown'}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.length === 0 ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        user.roles.map((role) => (
                          <Badge
                            key={role}
                            className={`text-[10px] px-1.5 py-0 border ${ROLE_BADGE_CLASSES[role as AppRole] ?? ''}`}
                          >
                            {ROLE_LABELS[role as AppRole] ?? role}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs">
                    {user.venue_names.length === 0 ? (
                      <span className="text-muted-foreground">All</span>
                    ) : (
                      <span>{user.venue_names.join(', ')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs ${user.is_active ? 'text-emerald-400' : 'text-zinc-500'}`}>
                      {user.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setExpandedId(isExpanded ? null : user.id)}
                      >
                        Manage
                        {isExpanded ? (
                          <ChevronUp className="ml-1 h-3 w-3" />
                        ) : (
                          <ChevronDown className="ml-1 h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {isExpanded && (
                  <TableRow key={`${user.id}-expand`} className="bg-muted/20">
                    <TableCell colSpan={5} className="px-4 py-3">
                      <div className="flex flex-wrap gap-4">
                        {/* Role assignment */}
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            Assign role
                          </p>
                          <div className="flex gap-1.5">
                            {(['super_admin', 'support', 'venue_staff'] as AppRole[]).map((role) => (
                              <Button
                                key={role}
                                size="sm"
                                variant={user.roles.includes(role) ? 'default' : 'outline'}
                                className="h-7 text-xs"
                                disabled={assignRole.isPending}
                                onClick={() => assignRole.mutate({ userId: user.id, role })}
                              >
                                {ROLE_LABELS[role]}
                              </Button>
                            ))}
                          </div>
                        </div>

                        {/* Venue assignment */}
                        <div className="flex flex-col gap-2">
                          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                            Venue access
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {venues.map((v) => {
                              const hasAccess = user.venue_ids.includes(v.id)
                              return (
                                <Button
                                  key={v.id}
                                  size="sm"
                                  variant={hasAccess ? 'default' : 'outline'}
                                  className="h-7 text-xs"
                                  disabled={assignVenue.isPending || removeVenue.isPending}
                                  onClick={() =>
                                    hasAccess
                                      ? removeVenue.mutate({ userId: user.id, venueId: v.id })
                                      : assignVenue.mutate({ userId: user.id, venueId: v.id })
                                  }
                                >
                                  {v.name}
                                </Button>
                              )
                            })}
                            {venues.length === 0 && (
                              <span className="text-xs text-muted-foreground">No venues</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
