'use client'

import { useState } from 'react'
import { Plus, Pencil } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { useTableTypes, useCreateTableType, useUpdateTableType } from '@/lib/hooks/venues/useTables'
import { UpsertTableTypeSchema, TABLE_TYPE_CODES, type UpsertTableTypePayload } from '@/lib/validators/tables'
import type { TableType } from '@/lib/types/table'

type Props = { venueId: string }

type FormValues = UpsertTableTypePayload

function TableTypeDialog({
  venueId,
  editing,
  onClose,
}: {
  venueId: string
  editing: TableType | null
  onClose: () => void
}) {
  const create = useCreateTableType(venueId)
  const update = useUpdateTableType(venueId)
  const isPending = create.isPending || update.isPending

  const { register, handleSubmit, setValue, watch, formState: { errors } } =
    useForm<FormValues>({
      resolver: zodResolver(UpsertTableTypeSchema) as never,
      defaultValues: editing
        ? { name: editing.name, code: editing.code, is_active: editing.is_active }
        : { name: '', code: 'standard', is_active: true },
    })

  const onSubmit = (values: FormValues) => {
    if (editing) {
      update.mutate({ id: editing.id, ...values }, { onSuccess: onClose })
    } else {
      create.mutate(values, { onSuccess: onClose })
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit table type' : 'New table type'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input {...register('name')} className="h-9 text-sm" placeholder="e.g. Billiard table" />
            {errors.name && <p className="text-xs text-red-400">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Code</Label>
            <Select
              value={watch('code')}
              onValueChange={(v: string) => setValue('code', v as UpsertTableTypePayload['code'])}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TABLE_TYPE_CODES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

export function TableTypesList({ venueId }: Props) {
  const { data, isLoading } = useTableTypes(venueId)
  const [dialogState, setDialogState] = useState<{ open: boolean; editing: TableType | null }>({
    open: false,
    editing: null,
  })
  const types = data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Table types control how tables are categorized and displayed.
        </p>
        <Button size="sm" onClick={() => setDialogState({ open: true, editing: null })} className="h-8">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add type
        </Button>
      </div>

      <div className="rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="h-9">
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Code</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i} className="h-10">
                <TableCell colSpan={4}><div className="h-4 animate-pulse rounded bg-muted" /></TableCell>
              </TableRow>
            ))}
            {!isLoading && types.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                  No table types yet.
                </TableCell>
              </TableRow>
            )}
            {types.map((tt) => (
              <TableRow key={tt.id} className="h-10">
                <TableCell className="text-sm font-medium">{tt.name}</TableCell>
                <TableCell className="text-xs font-mono text-muted-foreground">{tt.code}</TableCell>
                <TableCell>
                  <Badge className={tt.is_active
                    ? 'bg-emerald-500/15 text-emerald-400 text-[10px]'
                    : 'bg-zinc-500/15 text-zinc-400 text-[10px]'
                  }>
                    {tt.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setDialogState({ open: true, editing: tt })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {dialogState.open && (
        <TableTypeDialog
          venueId={venueId}
          editing={dialogState.editing}
          onClose={() => setDialogState({ open: false, editing: null })}
        />
      )}
    </div>
  )
}
