'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useVenueSettings, useUpdateVenueSettings } from '@/lib/hooks/venues/useVenues'
import { VenueSettingsSchema, type VenueSettingsPayload } from '@/lib/validators/venues'

type Props = {
  venueId: string
  readOnly?: boolean
}

const DEFAULTS: VenueSettingsPayload = {
  booking_enabled: true,
  auto_assignment_enabled: true,
  overflow_queue_enabled: true,
  default_duration_minutes: 120,
  min_duration_minutes: 60,
  max_duration_minutes: 300,
  min_notice_minutes: 0,
  max_advance_booking_days: 60,
  max_party_size: 20,
  max_total_capacity: 200,
  booking_buffer_before_minutes: 15,
  booking_buffer_after_minutes: 15,
  allow_combining_tables: false,
  allow_cross_group_table_blending: false,
  allow_alternative_time_suggestions: true,
  allow_cross_venue_suggestions: true,
}

export function VenueSettingsForm({ venueId, readOnly }: Props) {
  const { data, isLoading } = useVenueSettings(venueId)
  const update = useUpdateVenueSettings(venueId)

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isDirty },
  } = useForm<VenueSettingsPayload>({
    resolver: zodResolver(VenueSettingsSchema),
    defaultValues: DEFAULTS,
  })

  useEffect(() => {
    if (data?.data) reset({ ...DEFAULTS, ...data.data })
  }, [data, reset])

  if (isLoading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading settings…</div>
  }

  return (
    <form onSubmit={handleSubmit((v) => update.mutate(v))} className="space-y-6">
      <Section title="Booking controls">
        <ToggleField control={control} name="booking_enabled" label="Booking enabled"
          description="Allow new reservations to be created at this venue." disabled={readOnly} />
        <ToggleField control={control} name="auto_assignment_enabled" label="Auto-assignment enabled"
          description="When enabled, the system tries to assign a table automatically. When disabled, all bookings go straight to the overflow queue." disabled={readOnly} />
        <ToggleField control={control} name="overflow_queue_enabled" label="Overflow queue enabled"
          description="When enabled, unresolvable reservations land in the manual review queue instead of being rejected." disabled={readOnly} />
      </Section>

      <Separator />

      <Section title="Duration">
        <NumberField register={register} name="default_duration_minutes" label="Default duration (min)"
          hint="Used when the guest doesn't specify an end time." errors={errors} disabled={readOnly} />
        <NumberField register={register} name="min_duration_minutes" label="Min duration (min)"
          hint="Shortest booking slot accepted." errors={errors} disabled={readOnly} />
        <NumberField register={register} name="max_duration_minutes" label="Max duration (min)"
          hint="Longest booking slot accepted." errors={errors} disabled={readOnly} />
        <NumberField register={register} name="last_booking_before_close_minutes" label="Last booking before close (min)"
          hint="Latest a booking can start before closing. Must be between min and max duration. Leave empty to use min duration." errors={errors} disabled={readOnly} />
      </Section>

      <Separator />

      <Section title="Booking window">
        <NumberField register={register} name="min_notice_minutes" label="Min notice (min)"
          hint="How far in advance a booking must be made. 0 = same-minute walk-ins allowed." errors={errors} disabled={readOnly} />
        <NumberField register={register} name="max_advance_booking_days" label="Max advance booking (days)"
          hint="How far ahead guests can book." errors={errors} disabled={readOnly} />
      </Section>

      <Separator />

      <Section title="Capacity">
        <NumberField register={register} name="max_party_size" label="Max party size"
          hint="Largest party accepted for a single reservation." errors={errors} disabled={readOnly} />
        <NumberField register={register} name="max_total_capacity" label="Max total capacity"
          hint="Venue-wide concurrent guest cap across all confirmed reservations." errors={errors} disabled={readOnly} />
      </Section>

      <Separator />

      <Section title="Buffers">
        <NumberField register={register} name="booking_buffer_before_minutes" label="Buffer before (min)"
          hint="Gap required before a reservation starts (cleaning / setup time)." errors={errors} disabled={readOnly} />
        <NumberField register={register} name="booking_buffer_after_minutes" label="Buffer after (min)"
          hint="Gap required after a reservation ends before the table is available again." errors={errors} disabled={readOnly} />
      </Section>

      <Separator />

      <Section title="Table blending">
        <ToggleField control={control} name="allow_combining_tables" label="Allow combining tables"
          description="When no single table fits the party, the system can merge adjacent tables in the same blend group. Tables must have can_blend enabled and share a blend_group value."
          disabled={readOnly} />
        <ToggleField control={control} name="allow_cross_group_table_blending" label="Allow cross-group blending"
          description="Extends combining to tables across different blend groups (last resort). Only applies if Allow combining tables is also enabled."
          disabled={readOnly} />
      </Section>

      <Separator />

      <Section title="Suggestions">
        <ToggleField control={control} name="allow_alternative_time_suggestions" label="Alternative time suggestions"
          description="When the requested slot is unavailable, offer nearby time slots at the same venue." disabled={readOnly} />
        <ToggleField control={control} name="allow_cross_venue_suggestions" label="Cross-venue suggestions"
          description="When no slot is available at the requested venue, suggest availability at other venues." disabled={readOnly} />
      </Section>

      {!readOnly && (
        <div className="flex justify-end pt-2">
          <Button type="submit" disabled={update.isPending || !isDirty}>
            {update.isPending ? 'Saving…' : 'Save settings'}
          </Button>
        </div>
      )}
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function ToggleField({
  control,
  name,
  label,
  description,
  disabled,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any
  name: keyof VenueSettingsPayload
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <Controller
      control={control}
      name={name as string}
      render={({ field }) => (
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium leading-none">{label}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            )}
          </div>
          <Switch
            checked={field.value as boolean}
            onCheckedChange={field.onChange}
            disabled={disabled}
            className="mt-0.5 shrink-0"
          />
        </div>
      )}
    />
  )
}

function NumberField({
  register,
  name,
  label,
  hint,
  errors,
  disabled,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: any
  name: keyof VenueSettingsPayload
  label: string
  hint?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: Record<string, any>
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        {errors[name] && <p className="text-[11px] text-red-400 mt-0.5">{errors[name]?.message}</p>}
      </div>
      <Input
        type="number"
        {...register(name, { valueAsNumber: true })}
        className="h-8 w-24 text-sm text-right shrink-0"
        disabled={disabled}
      />
    </div>
  )
}
