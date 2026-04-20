'use client'

import { useState } from 'react'
import { Plus, Trash2, GripVertical, X, Pencil, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
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

// ─── Single group card ────────────────────────────────────────────────────────

function GroupCard({ group }: { group: VenueGroup }) {
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
              className="h-7 w-7 text-red-400 hover:text-red-300"
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
        <p className="text-xs text-muted-foreground italic">No venues yet.</p>
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
            <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
            <Badge variant="outline" className="text-[10px] tabular-nums w-5 h-5 flex items-center justify-center p-0 shrink-0">
              {idx + 1}
            </Badge>
            <span className="flex-1 truncate">{m.venues?.name ?? m.venue_id}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              onClick={() => removeMember.mutate(m.venue_id)}
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>

      {/* Add venue */}
      {addingVenue ? (
        <div className="flex gap-2">
          <select
            value={selectedVenueId}
            onChange={(e) => setSelectedVenueId(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">Select a venue…</option>
            {availableToAdd.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
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
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setAddingVenue(false); setSelectedVenueId('') }}>
            Cancel
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
            Add venue
          </Button>
        )
      )}
    </div>
  )
}

// ─── Manager ──────────────────────────────────────────────────────────────────

export function VenueGroupsManager() {
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
          Groups define which venues can receive each other&apos;s overflow. Drag to set priority order.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New group
        </Button>
      </div>

      {creating && (
        <div className="flex gap-2 rounded-lg border border-dashed border-border p-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setNewName('') } }}
            placeholder="Group name…"
            autoFocus
            className="h-8 text-sm flex-1"
          />
          <Button size="sm" onClick={handleCreate} disabled={!newName.trim() || create.isPending}>
            Create
          </Button>
          <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setNewName('') }}>
            Cancel
          </Button>
        </div>
      )}

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!isLoading && groups.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground italic py-4 text-center">
          No venue groups yet. Create one to enable group-based overflow routing.
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
