'use client'

import { useState } from 'react'
import { Plus, Pencil, GripVertical, AlertTriangle } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  useTables,
  useTableTypes,
  useCreateTable,
  useUpdateTable,
  useDeactivateTable,
} from '@/lib/hooks/venues/useTables'
import { UpsertTableSchema, type UpsertTablePayload } from '@/lib/validators/tables'
import type { Table as TableRow_ } from '@/lib/types/table'

type Props = { venueId: string }

// ─── Table form dialog ────────────────────────────────────────────────────────

function TableDialog({
  venueId,
  editing,
  onClose,
}: {
  venueId: string
  editing: TableRow_ | null
  onClose: () => void
}) {
  const { data: typesData } = useTableTypes(venueId)
  const tableTypes = typesData?.data ?? []

  const create = useCreateTable(venueId)
  const update = useUpdateTable(venueId)
  const isPending = create.isPending || update.isPending

  const { register, handleSubmit, setValue, watch, formState: { errors } } =
    useForm<UpsertTablePayload>({
      resolver: zodResolver(UpsertTableSchema) as never,
      defaultValues: editing
        ? {
            name: editing.name,
            table_type_id: editing.table_type_id ?? undefined,
            area: editing.area ?? undefined,
            capacity_min: editing.capacity_min,
            capacity_max: editing.capacity_max,
            sort_order: editing.sort_order,
            blend_group: editing.blend_group ?? undefined,
            can_blend: editing.can_blend,
            is_active: editing.is_active,
          }
        : { name: '', capacity_min: 2, capacity_max: 4, sort_order: 1, can_blend: false, is_active: true },
    })

  const onSubmit = (values: UpsertTablePayload) => {
    if (editing) {
      update.mutate({ id: editing.id, ...values }, { onSuccess: onClose })
    } else {
      create.mutate(values, { onSuccess: onClose })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit table' : 'New table'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5 col-span-2">
              <Label className="text-xs">Name</Label>
              <Input {...register('name')} className="h-9 text-sm" placeholder="e.g. Table 1" />
              {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Min capacity</Label>
              <Input type="number" min={1} {...register('capacity_min', { valueAsNumber: true })} className="h-9 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Max capacity</Label>
              <Input type="number" min={1} {...register('capacity_max', { valueAsNumber: true })} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Type</Label>
              <Select
                value={watch('table_type_id') ?? '__none'}
                onValueChange={(v: string) =>
                  setValue('table_type_id', v === '__none' ? undefined : v)
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="No type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No type</SelectItem>
                  {tableTypes.filter((t) => t.is_active).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Area</Label>
              <Input {...register('area')} className="h-9 text-sm" placeholder="e.g. Main floor" />
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Blending</p>
            <p className="text-[11px] text-muted-foreground">
              Tables in the same blend group can be combined for large parties. Contiguous tables
              (by sort order) within a group are merged first.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Blend group</Label>
                <Input {...register('blend_group')} className="h-9 text-sm" placeholder="e.g. main-floor" />
              </div>
              <div className="flex items-center justify-between gap-4 pt-4">
                <Label className="text-sm">Can blend</Label>
                <Switch
                  checked={watch('can_blend')}
                  onCheckedChange={(v) => setValue('can_blend', v)}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <Label className="text-sm">Active</Label>
            <Switch
              checked={watch('is_active')}
              onCheckedChange={(v) => setValue('is_active', v)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : editing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Deactivate confirmation ──────────────────────────────────────────────────

function DeactivateRow({ venueId, tableId, onDone }: { venueId: string; tableId: string; onDone: () => void }) {
  const deactivate = useDeactivateTable(venueId)
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Deactivate table?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          The table will no longer be available for auto-assignment. Existing confirmed reservations
          are not affected.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onDone}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={deactivate.isPending}
            onClick={() => deactivate.mutate(tableId, { onSuccess: onDone })}
          >
            {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── TableRow component (hooks at component level) ────────────────────────────

function TableRowItem({
  table,
  venueId,
  onEdit,
}: {
  table: TableRow_
  venueId: string
  onEdit: (t: TableRow_) => void
}) {
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)

  return (
    <>
      <TableRow className="h-10">
        <TableCell className="w-8">
          <GripVertical className="h-4 w-4 text-muted-foreground/40 cursor-grab" />
        </TableCell>
        <TableCell className="text-sm font-medium">{table.name}</TableCell>
        <TableCell className="text-xs text-muted-foreground">
          {table.table_types?.name ?? '—'}
        </TableCell>
        <TableCell className="text-xs text-muted-foreground">{table.area ?? '—'}</TableCell>
        <TableCell className="text-xs tabular-nums">
          {table.capacity_min}–{table.capacity_max}
        </TableCell>
        <TableCell>
          <span
            className="text-xs text-muted-foreground font-mono"
            title="Blend group: tables sharing a group name can be combined for large parties. can_blend must also be enabled."
          >
            {table.blend_group ?? '—'}
          </span>
        </TableCell>
        <TableCell className="text-center">
          {table.can_blend
            ? <span className="text-[10px] text-emerald-400">Yes</span>
            : <span className="text-[10px] text-muted-foreground">No</span>}
        </TableCell>
        <TableCell>
          <Badge className={table.is_active
            ? 'bg-emerald-500/15 text-emerald-400 text-[10px]'
            : 'bg-zinc-500/15 text-zinc-400 text-[10px]'
          }>
            {table.is_active ? 'Active' : 'Inactive'}
          </Badge>
        </TableCell>
        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(table)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {table.is_active && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-red-400"
                onClick={() => setConfirmDeactivate(true)}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
      {confirmDeactivate && (
        <DeactivateRow
          venueId={venueId}
          tableId={table.id}
          onDone={() => setConfirmDeactivate(false)}
        />
      )}
    </>
  )
}

// ─── Main list ────────────────────────────────────────────────────────────────

export function TablesList({ venueId }: Props) {
  const { data, isLoading } = useTables(venueId)
  const [dialogState, setDialogState] = useState<{ open: boolean; editing: TableRow_ | null }>({
    open: false,
    editing: null,
  })
  const tables = data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Drag rows to set sort order — allocation prefers lower sort_order tables first.
        </p>
        <Button
          size="sm"
          onClick={() => setDialogState({ open: true, editing: null })}
          className="h-8"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add table
        </Button>
      </div>

      <div className="rounded-md border border-border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              <TableHead className="w-8" />
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Area</TableHead>
              <TableHead className="text-xs">Capacity</TableHead>
              <TableHead className="text-xs">Blend group</TableHead>
              <TableHead className="text-xs text-center">Can blend</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i} className="h-10">
                <TableCell colSpan={9}><div className="h-4 animate-pulse rounded bg-muted" /></TableCell>
              </TableRow>
            ))}
            {!isLoading && tables.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                  No tables yet.
                </TableCell>
              </TableRow>
            )}
            {tables.map((t) => (
              <TableRowItem
                key={t.id}
                table={t}
                venueId={venueId}
                onEdit={(tt) => setDialogState({ open: true, editing: tt })}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      {dialogState.open && (
        <TableDialog
          venueId={venueId}
          editing={dialogState.editing}
          onClose={() => setDialogState({ open: false, editing: null })}
        />
      )}
    </div>
  )
}
