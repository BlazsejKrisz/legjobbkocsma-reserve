'use client'

import { useEffect } from 'react'
import { useForm, Controller } from 'react-hook-form'
import type { Control, UseFormRegister, FieldErrors } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { useVenueSettings, useUpdateVenueSettings } from '@/lib/hooks/venues/useVenues'
import { VenueSettingsSchema, type VenueSettingsPayload } from '@/lib/validators/venues'
import { useT } from '@/lib/i18n/useT'

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
  const t = useT()
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
    return <div className="py-8 text-center text-sm text-muted-foreground">{t.venue_settings.loading}</div>
  }

  return (
    <form onSubmit={handleSubmit((v) => update.mutate(v))}>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">

        {/* Left — toggles (behaviour switches) */}
        <div className="space-y-6">
          <Section title={t.venue_settings.booking_controls}>
            <ToggleField control={control} name="booking_enabled" label={t.venue_settings.booking_enabled}
              description={t.venue_settings.booking_enabled_desc} disabled={readOnly} />
            <ToggleField control={control} name="auto_assignment_enabled" label={t.venue_settings.auto_assignment}
              description={t.venue_settings.auto_assignment_desc} disabled={readOnly} />
            <ToggleField control={control} name="overflow_queue_enabled" label={t.venue_settings.overflow_queue}
              description={t.venue_settings.overflow_queue_desc} disabled={readOnly} />
          </Section>

          <Separator />

          <Section title={t.venue_settings.table_blending}>
            <ToggleField control={control} name="allow_combining_tables" label={t.venue_settings.combining_tables}
              description={t.venue_settings.combining_tables_desc} disabled={readOnly} />
            <ToggleField control={control} name="allow_cross_group_table_blending" label={t.venue_settings.cross_group_blending}
              description={t.venue_settings.cross_group_blending_desc} disabled={readOnly} />
          </Section>

          <Separator />

          <Section title={t.venue_settings.suggestions}>
            <ToggleField control={control} name="allow_alternative_time_suggestions" label={t.venue_settings.alt_time}
              description={t.venue_settings.alt_time_desc} disabled={readOnly} />
            <ToggleField control={control} name="allow_cross_venue_suggestions" label={t.venue_settings.cross_venue}
              description={t.venue_settings.cross_venue_desc} disabled={readOnly} />
          </Section>
        </div>

        {/* Right — numbers (tuning parameters) */}
        <div className="space-y-6">
          <Section title={t.venue_settings.duration}>
            <NumberField register={register} name="default_duration_minutes" label={t.venue_settings.default_duration}
              hint={t.venue_settings.default_duration_hint} errors={errors} disabled={readOnly} />
            <NumberField register={register} name="min_duration_minutes" label={t.venue_settings.min_duration}
              hint={t.venue_settings.min_duration_hint} errors={errors} disabled={readOnly} />
            <NumberField register={register} name="max_duration_minutes" label={t.venue_settings.max_duration}
              hint={t.venue_settings.max_duration_hint} errors={errors} disabled={readOnly} />
            <NumberField register={register} name="last_booking_before_close_minutes" label={t.venue_settings.last_booking}
              hint={t.venue_settings.last_booking_hint} errors={errors} disabled={readOnly} />
          </Section>

          <Separator />

          <Section title={t.venue_settings.booking_window}>
            <NumberField register={register} name="min_notice_minutes" label={t.venue_settings.min_notice}
              hint={t.venue_settings.min_notice_hint} errors={errors} disabled={readOnly} />
            <NumberField register={register} name="max_advance_booking_days" label={t.venue_settings.max_advance}
              hint={t.venue_settings.max_advance_hint} errors={errors} disabled={readOnly} />
          </Section>

          <Separator />

          <Section title={t.venue_settings.capacity}>
            <NumberField register={register} name="max_party_size" label={t.venue_settings.max_party_size}
              hint={t.venue_settings.max_party_size_hint} errors={errors} disabled={readOnly} />
            <NumberField register={register} name="max_total_capacity" label={t.venue_settings.max_total_capacity}
              hint={t.venue_settings.max_total_capacity_hint} errors={errors} disabled={readOnly} />
          </Section>

          <Separator />

          <Section title={t.venue_settings.buffers}>
            <NumberField register={register} name="booking_buffer_before_minutes" label={t.venue_settings.buffer_before}
              hint={t.venue_settings.buffer_before_hint} errors={errors} disabled={readOnly} />
            <NumberField register={register} name="booking_buffer_after_minutes" label={t.venue_settings.buffer_after}
              hint={t.venue_settings.buffer_after_hint} errors={errors} disabled={readOnly} />
          </Section>
        </div>

      </div>

      {!readOnly && (
        <div className="flex justify-end pt-6 mt-2 border-t border-border">
          <Button type="submit" disabled={update.isPending || !isDirty}>
            {update.isPending ? t.common.saving : t.common.save}
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
  control: Control<VenueSettingsPayload>
  name: keyof VenueSettingsPayload
  label: string
  description?: string
  disabled?: boolean
}) {
  return (
    <Controller
      control={control}
      name={name}
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
  register: UseFormRegister<VenueSettingsPayload>
  name: keyof VenueSettingsPayload
  label: string
  hint?: string
  errors: FieldErrors<VenueSettingsPayload>
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
        {errors[name] && <p className="text-[11px] text-destructive mt-0.5">{errors[name]?.message}</p>}
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
