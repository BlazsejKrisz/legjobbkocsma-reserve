'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useEffect } from 'react'
import { useCreateReservation } from '@/lib/hooks/reservations/useCreateReservation'
import { CreateReservationSchema, type CreateReservationPayload } from '@/lib/validators/reservations'
import { fromLocalDateAndTimes, todayYYYYMMDD } from '@/lib/datetime'
import type { Venue } from '@/lib/types/venue'
import type { TableType } from '@/lib/types/table'

type Props = {
  open: boolean
  onClose: () => void
  venues: Venue[]
  tableTypes: TableType[]
  defaultVenueId?: string
  prefill?: {
    date?: string
    from_time?: string
    until_time?: string
  }
}

type FormValues = {
  venue_id: string
  date: string
  from_time: string
  until_time: string
  party_size: number
  source: string
  special_requests: string
  customer_full_name: string
  customer_email: string
  customer_phone: string
  requested_table_type_id: string
}

export function CreateReservationDialog({
  open,
  onClose,
  venues,
  tableTypes,
  defaultVenueId,
  prefill,
}: Props) {
  const create = useCreateReservation()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      venue_id: defaultVenueId ?? venues[0]?.id ?? '',
      date: prefill?.date ?? todayYYYYMMDD(),
      from_time: prefill?.from_time ?? '19:00',
      until_time: prefill?.until_time ?? '21:00',
      party_size: 2,
      source: 'admin',
      special_requests: '',
      customer_full_name: '',
      customer_email: '',
      customer_phone: '',
      requested_table_type_id: '',
    },
  })

  // Re-initialise defaults whenever the dialog opens with new prefill values
  useEffect(() => {
    if (open) {
      reset({
        venue_id: defaultVenueId ?? venues[0]?.id ?? '',
        date: prefill?.date ?? todayYYYYMMDD(),
        from_time: prefill?.from_time ?? '19:00',
        until_time: prefill?.until_time ?? '21:00',
        party_size: 2,
        source: 'admin',
        special_requests: '',
        customer_full_name: '',
        customer_email: '',
        customer_phone: '',
        requested_table_type_id: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const onSubmit = (values: FormValues) => {
    const { starts_at, ends_at } = fromLocalDateAndTimes(
      values.date,
      values.from_time,
      values.until_time,
      { allowOvernight: true },
    )

    const payload: CreateReservationPayload = {
      venue_id: values.venue_id,
      starts_at,
      ends_at,
      party_size: Number(values.party_size),
      source: values.source as CreateReservationPayload['source'],
      special_requests: values.special_requests || null,
      customer_full_name: values.customer_full_name || undefined,
      customer_email: values.customer_email || undefined,
      customer_phone: values.customer_phone || undefined,
      requested_table_type_id: values.requested_table_type_id || undefined,
    }

    create.mutate(payload, {
      onSuccess: () => {
        reset()
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New reservation</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {venues.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Venue</Label>
              <Select
                value={watch('venue_id')}
                onValueChange={(v: string) => setValue('venue_id', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {venues.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1 flex flex-col gap-1.5">
              <Label className="text-xs">Date</Label>
              <Input type="date" {...register('date')} className="h-9 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">From</Label>
              <Input type="time" {...register('from_time')} className="h-9 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Until</Label>
              <Input type="time" {...register('until_time')} className="h-9 text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Party size</Label>
              <Input
                type="number"
                min={1}
                {...register('party_size', { valueAsNumber: true })}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Source</Label>
              <Select
                value={watch('source')}
                onValueChange={(v: string) => setValue('source', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['web', 'phone', 'admin', 'walk_in', 'partner'].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tableTypes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Table type preference (optional)</Label>
              <Select
                value={watch('requested_table_type_id')}
                onValueChange={(v: string) =>
                  setValue('requested_table_type_id', v === '__none' ? '' : v)
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Any type</SelectItem>
                  {tableTypes.map((tt) => (
                    <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Special requests (optional)</Label>
            <Textarea
              {...register('special_requests')}
              placeholder="Guest message or special requirements…"
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">Customer <span className="text-destructive">*</span> <span className="font-normal">(email or phone required)</span></p>
            <Input
              {...register('customer_full_name')}
              placeholder="Full name"
              className="h-9 text-sm"
            />
            <Input
              {...register('customer_email')}
              type="email"
              placeholder="Email"
              className="h-9 text-sm"
            />
            <Input
              {...register('customer_phone')}
              placeholder="Phone"
              className="h-9 text-sm"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create reservation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
