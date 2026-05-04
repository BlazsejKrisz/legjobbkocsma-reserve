'use client'

import { useForm } from 'react-hook-form'
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
import { useEffect, useState } from 'react'
import { useCreateReservation } from '@/lib/hooks/reservations/useCreateReservation'
import type { CreateReservationPayload } from '@/lib/validators/reservations'
import { fromLocalDateAndTimes, todayYYYYMMDD } from '@/lib/datetime'
import type { Venue } from '@/lib/types/venue'
import type { TableType } from '@/lib/types/table'
import { useT } from '@/lib/i18n/useT'

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

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  const newH = Math.floor(total / 60) % 24
  const newM = total % 60
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`
}

const DEFAULT_OFFSET_MIN = 120

export function CreateReservationDialog({
  open,
  onClose,
  venues,
  tableTypes,
  defaultVenueId,
  prefill,
}: Props) {
  const t = useT()
  const create = useCreateReservation()

  // custom until is on when the timeline provided an explicit end time
  const [customUntil, setCustomUntil] = useState(() => !!prefill?.until_time)

  const defaultFrom = prefill?.from_time ?? '19:00'
  const defaultUntil = prefill?.until_time ?? addMinutes(defaultFrom, DEFAULT_OFFSET_MIN)

  const { register, handleSubmit, setValue, watch, reset } = useForm<FormValues>({
    defaultValues: {
      venue_id: defaultVenueId ?? venues[0]?.id ?? '',
      date: prefill?.date ?? todayYYYYMMDD(),
      from_time: defaultFrom,
      until_time: defaultUntil,
      party_size: 2,
      source: 'admin',
      special_requests: '',
      customer_full_name: '',
      customer_email: '',
      customer_phone: '',
      requested_table_type_id: '',
    },
  })

  // Re-initialise whenever the dialog opens with new prefill values
  useEffect(() => {
    if (open) {
      const from = prefill?.from_time ?? '19:00'
      const hasExplicitUntil = !!prefill?.until_time
      setCustomUntil(hasExplicitUntil)
      reset({
        venue_id: defaultVenueId ?? venues[0]?.id ?? '',
        date: prefill?.date ?? todayYYYYMMDD(),
        from_time: from,
        until_time: prefill?.until_time ?? addMinutes(from, DEFAULT_OFFSET_MIN),
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

  // Auto-update until_time when from_time changes (while custom is off)
  const fromTime = watch('from_time')
  useEffect(() => {
    if (!customUntil) {
      setValue('until_time', addMinutes(fromTime, DEFAULT_OFFSET_MIN))
    }
  }, [fromTime, customUntil, setValue])

  const onSubmit = (values: FormValues) => {
    const { starts_at, ends_at } = fromLocalDateAndTimes(
      values.date,
      values.from_time,
      values.until_time,
      { allowOvernight: true },
    )

    const payload: CreateReservationPayload = {
      venue_id: Number(values.venue_id),
      starts_at,
      ends_at,
      party_size: Number(values.party_size),
      source: values.source as CreateReservationPayload['source'],
      special_requests: values.special_requests || null,
      customer_full_name: values.customer_full_name || undefined,
      customer_email: values.customer_email || undefined,
      customer_phone: values.customer_phone || undefined,
      requested_table_type_id: values.requested_table_type_id
        ? Number(values.requested_table_type_id)
        : undefined,
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
          <DialogTitle>{t.create.title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {venues.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t.create.venue}</Label>
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

          {/* Date — full row */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t.create.date}</Label>
            <Input type="date" {...register('date')} className="h-9 text-sm" />
          </div>

          {/* From + Until — same row */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t.create.from}</Label>
              <Input type="time" {...register('from_time')} className="h-9 text-sm" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t.create.until}</Label>
              <Input
                type="time"
                {...register('until_time')}
                disabled={!customUntil}
                className="h-9 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={customUntil}
                  onChange={(e) => {
                    setCustomUntil(e.target.checked)
                    if (!e.target.checked) {
                      setValue('until_time', addMinutes(fromTime, DEFAULT_OFFSET_MIN))
                    }
                  }}
                  className="h-3.5 w-3.5 rounded border-border accent-primary"
                />
                <span className="text-xs text-muted-foreground">{t.create.custom_until}</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t.create.party_size}</Label>
              <Input
                type="number"
                min={1}
                {...register('party_size', { valueAsNumber: true })}
                className="h-9 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t.create.source}</Label>
              <Select
                value={watch('source')}
                onValueChange={(v: string) => setValue('source', v)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web">{t.source.web}</SelectItem>
                  <SelectItem value="phone">{t.source.phone}</SelectItem>
                  <SelectItem value="admin">{t.source.admin}</SelectItem>
                  <SelectItem value="walk_in">{t.source.walk_in}</SelectItem>
                  <SelectItem value="partner">{t.source.partner}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {tableTypes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{t.create.table_type}</Label>
              <Select
                value={watch('requested_table_type_id')}
                onValueChange={(v: string) =>
                  setValue('requested_table_type_id', v === '__none' ? '' : v)
                }
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t.create.table_type_placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t.create.table_type_placeholder}</SelectItem>
                  {tableTypes.map((tt) => (
                    <SelectItem key={tt.id} value={tt.id}>{tt.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t.create.special_requests}</Label>
            <Textarea
              {...register('special_requests')}
              placeholder={t.create.special_requests_placeholder}
              rows={2}
              className="text-sm resize-none"
            />
          </div>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              {t.create.customer} <span className="text-destructive">*</span>{' '}
              <span className="font-normal">({t.create.customer_requirement})</span>
            </p>
            <Input
              {...register('customer_full_name')}
              placeholder={t.create.name_placeholder}
              className="h-9 text-sm"
            />
            <Input
              {...register('customer_email')}
              type="email"
              placeholder={t.create.email_placeholder}
              className="h-9 text-sm"
            />
            <Input
              {...register('customer_phone')}
              placeholder={t.create.phone_placeholder}
              className="h-9 text-sm"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>{t.common.cancel}</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t.common.creating : t.create.create_button}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
