'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, X, Pencil, Check, ChevronUp, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useVenueGroups,
  useCreateVenueGroup,
  useUpdateVenueGroup,
  useDeleteVenueGroup,
  useAddGroupMember,
  useRemoveGroupMember,
  useReorderGroupMembers,
} from '@/lib/hooks/venues/useVenueGroups'
import { useVenues } from '@/lib/hooks/venues/useVenues'
import type { VenueGroup } from '@/lib/types/venueGroup'
import { useT } from '@/lib/i18n/useT'

// ─── Single group card ────────────────────────────────────────────────────────

function GroupCard({ group }: { group: VenueGroup }) {
  const t = useT()
  const [renaming, setRenaming] = useState(false)
  const [nameInput, setNameInput] = useState(group.name)
  const [addingVenue, setAddingVenue] = useState(false)
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [dragging, setDragging] = useState<string | null>(null)

  const updateGroup = useUpdateVenueGroup(group.id)
  const deleteGroup = useDeleteVenueGroup()
  const addMember = useAddGroupMember(group.id)
  const removeMember = useRemoveGroupMember(group.id)
  const reorder = useReorderGroupMembers(group.id)
  const { data: venuesData } = useVenues()

  const allVenues = venuesData?.data ?? []
  const memberVenueIds = new Set(group.venue_group_members.map((m) => m.venue_id))
  const availableToAdd = allVenues.filter((v) => !memberVenueIds.has(v.id))

  const members = [...group.venue_group_members].sort((a, b) => a.priority - b.priority)

  const handleRename = () => {
    if (nameInput.trim() && nameInput !== group.name) {
      updateGroup.mutate(nameInput.trim(), { onSuccess: () => setRenaming(false) })
    } else {
      setRenaming(false)
    }
  }

  // Simple drag-to-reorder (HTML5 drag, no extra deps)
  const handleDragStart = (venueId: string) => setDragging(venueId)
  const handleDrop = (targetVenueId: string) => {
    if (!dragging || dragging === targetVenueId) return
    const ids = members.map((m) => m.venue_id)
    const from = ids.indexOf(dragging)
    const to = ids.indexOf(targetVenueId)
    if (from === -1 || to === -1) return
    const reordered = [...ids]
    reordered.splice(from, 1)
    reordered.splice(to, 0, dragging)
    reorder.mutate(reordered.map(Number))
    setDragging(null)
  }

  // Keyboard alternative to drag — shifts a member up/down by one slot.
  // HTML5 drag is mouse-only; this gives super_admins on a laptop or
  // power-users a way to reorder without touching the mouse.
  const moveBy = (venueId: string, delta: -1 | 1) => {
    const ids = members.map((m) => m.venue_id)
    const from = ids.indexOf(venueId)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ids.length) return
    const reordered = [...ids]
    const [moved] = reordered.splice(from, 1)
    if (!moved) return
    reordered.splice(to, 0, moved)
    reorder.mutate(reordered.map(Number))
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        {renaming ? (
          <div className="flex flex-1 items-center gap-2">
            <Input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setRenaming(false) }}
              autoFocus
              className="h-7 text-sm flex-1"
            />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRename}>
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setRenaming(false); setNameInput(group.name) }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-1 items-center gap-2">
            <span className="font-medium text-sm flex-1">{group.name}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setRenaming(true)}>
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive hover:text-destructive"
              disabled={deleteGroup.isPending}
              onClick={() => deleteGroup.mutate(group.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      <Separator />

      {/* Members */}
      {members.length === 0 && (
        <p className="text-xs text-muted-foreground italic">{t.venue_groups.no_venues}</p>
      )}
      <div className="flex flex-col gap-1">
        {members.map((m, idx) => (
          <div
            key={m.venue_id}
            draggable
            onDragStart={() => handleDragStart(m.venue_id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(m.venue_id)}
            className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm cursor-grab select-none transition-colors ${
              dragging === m.venue_id ? 'opacity-40 border-ring' : 'border-border'
            }`}
          >
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" aria-hidden />
            <Badge variant="outline" className="text-[10px] tabular-nums w-5 h-5 flex items-center justify-center p-0 shrink-0">
              {idx + 1}
            </Badge>
            <span className="flex-1 truncate">{m.venues?.name ?? m.venue_id}</span>
            {/* Keyboard reorder controls — accessible alternative to
                HTML5 drag.  Disabled at the boundaries so screen readers
                announce the position correctly. */}
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              disabled={idx === 0 || reorder.isPending}
              onClick={() => moveBy(m.venue_id, -1)}
              aria-label={`Move ${m.venues?.name ?? m.venue_id} up`}
            >
              <ChevronUp />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              disabled={idx === members.length - 1 || reorder.isPending}
              onClick={() => moveBy(m.venue_id, 1)}
              aria-label={`Move ${m.venues?.name ?? m.venue_id} down`}
            >
              <ChevronDown />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => removeMember.mutate(m.venue_id)}
              aria-label={`Remove ${m.venues?.name ?? m.venue_id}`}
            >
              <X className="text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add venue */}
      {addingVenue ? (
        <div className="flex gap-2">
          <Select value={selectedVenueId} onValueChange={setSelectedVenueId}>
            <SelectTrigger className="flex-1 h-8 text-sm">
              <SelectValue placeholder={t.venue_groups.select_venue_placeholder} />
            </SelectTrigger>
            <SelectContent>
              {availableToAdd.map((v) => (
                <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedVenueId || addMember.isPending}
            onClick={() => {
              if (selectedVenueId) {
                addMember.mutate(Number(selectedVenueId), {
                  onSuccess: () => { setAddingVenue(false); setSelectedVenueId('') },
                })
              }
            }}
          >
            {t.common.add}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddingVenue(false); setSelectedVenueId('') }}>
            {t.common.cancel}
          </Button>
        </div>
      ) : (
        availableToAdd.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full text-xs"
            onClick={() => setAddingVenue(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t.venue_groups.add_venue}
          </Button>
        )
      )}
    </div>
  )
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export function VenueGroupsManager() {
  const t = useT()
  const { data, isLoading } = useVenueGroups()
  const create = useCreateVenueGroup()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const groups: VenueGroup[] = data?.data ?? []

  const handleCreate = () => {
    if (!newName.trim()) return
    create.mutate(newName.trim(), {
      onSuccess: () => { setNewName(''); setCreating(false) },
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {t.venue_groups.desc}
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {t.venue_groups.new_group}
        </Button>
      </div>

      {creating && (
        <div className="flex gap-2 rounded-lg border border-dashed border-border p-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder={t.venue_groups.group_name_placeholder}
            autoFocus
            className="h-8 text-sm flex-1"
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || create.isPending}>
            {t.common.create}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName('') }}>
            {t.common.cancel}
          </Button>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">{t.venue_groups.loading}</p>}
      {!isLoading && groups.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          {t.venue_groups.no_groups}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => (
          <GroupCard key={g.id} group={g} />
        ))}
      </div>
    </div>
  )
}
