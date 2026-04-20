'use client'

import { useEffect } from 'react'
import { useFieldArray, useForm, Controller } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { useVenueOpenHours, useUpdateOpenHours } from '@/lib/hooks/venues/useVenues'
import { WEEKDAYS, WEEKDAY_LABELS } from '@/lib/types/venue'
import type { VenueOpenHours, Weekday } from '@/lib/types/venue'

type Props = {
  venueId: string
  readOnly?: boolean
}

type FormRow = {
  weekday: Weekday
  is_open: boolean
  open_time: string
  close_time: string
}

type FormValues = { hours: FormRow[] }

function buildDefaults(): FormRow[] {
  return WEEKDAYS.map((weekday) => ({
    weekday,
    is_open: weekday !== 'monday', // sensible default: open Tue–Sun
    open_time: '18:00',
    close_time: '02:00',
  }))
}

function mergeWithDefaults(dbRows: VenueOpenHours[]): FormRow[] {
  const byWeekday = new Map(dbRows.map((r) => [r.weekday, r]))
  return WEEKDAYS.map((weekday) => {
    const row = byWeekday.get(weekday)
    return {
      weekday,
      is_open: row?.is_open ?? false,
      open_time: row?.open_time ?? '18:00',
      close_time: row?.close_time ?? '02:00',
    }
  })
}

/** True when close_time is earlier than or equal to open_time (overnight). */
function isOvernight(open: string, close: string): boolean {
  return close <= open
}

export function OpenHoursEditor({ venueId, readOnly }: Props) {
  const { data, isLoading } = useVenueOpenHours(venueId)
  const update = useUpdateOpenHours(venueId)

  const { control, register, handleSubmit, reset, watch } = useForm<FormValues>({
    defaultValues: { hours: buildDefaults() },
  })

  const { fields } = useFieldArray({ control, name: 'hours' })

  useEffect(() => {
    if (data?.data) reset({ hours: mergeWithDefaults(data.data) })
  }, [data, reset])

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading hours…</div>
  }

  const onSubmit = ({ hours }: FormValues) => {
    update.mutate(
      hours.map((h) => ({
        weekday: h.weekday,
        is_open: h.is_open,
        open_time: h.is_open ? h.open_time : null,
        close_time: h.is_open ? h.close_time : null,
      })),
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        If close time is before or equal to open time, the venue is considered open overnight
        (past midnight). These rows will show a &quot;next day&quot; label.
      </p>

      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Day</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Open</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Opens</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Closes</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field, i) => (
              <Controller
                key={field.id}
                control={control}
                name={`hours.${i}.is_open`}
                render={({ field: openField }) => {
                  const openTime = watch(`hours.${i}.open_time`)
                  const closeTime = watch(`hours.${i}.close_time`)
                  const overnight = openField.value && isOvernight(openTime, closeTime)

                  return (
                    <tr className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2.5 text-sm font-medium w-28">
                        {WEEKDAY_LABELS[field.weekday]}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Switch
                          checked={openField.value}
                          onCheckedChange={openField.onChange}
                          disabled={readOnly}
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="time"
                          {...register(`hours.${i}.open_time`)}
                          disabled={!openField.value || readOnly}
                          className="h-8 w-28 text-sm disabled:opacity-40"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          type="time"
                          {...register(`hours.${i}.close_time`)}
                          disabled={!openField.value || readOnly}
                          className="h-8 w-28 text-sm disabled:opacity-40"
                        />
                        {overnight && (
                          <p className="text-[10px] text-amber-400 mt-0.5">next day</p>
                        )}
                      </td>
                    </tr>
                  )
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      {!readOnly && (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save hours'}
          </Button>
        </div>
      )}
    </form>
  )
}
