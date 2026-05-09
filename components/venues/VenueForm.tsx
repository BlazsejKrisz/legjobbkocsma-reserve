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
import { useCreateVenue } from '@/lib/hooks/venues/useVenues'
import { CreateVenueSchema, type CreateVenuePayload } from '@/lib/validators/venues'
import { useT } from '@/lib/i18n/useT'

type Props = {
  open: boolean
  onClose: () => void
}

export function CreateVenueDialog({ open, onClose }: Props) {
  const t = useT()
  const create = useCreateVenue()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateVenuePayload>({
    resolver: zodResolver(CreateVenueSchema),
  })

  const onSubmit = (values: CreateVenuePayload) => {
    create.mutate(values, {
      onSuccess: () => {
        reset()
        onClose()
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.venues.create_title}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t.venues.name}</Label>
            <Input {...register('name')} className="h-9 text-sm" placeholder={t.venues.name_placeholder} />
            {errors.name && (
              <p className="text-[11px] text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t.venues.slug}</Label>
            <Input
              {...register('slug')}
              className="h-9 text-sm"
              placeholder={t.venues.slug_placeholder}
            />
            <p className="text-[10px] text-muted-foreground">
              {t.venues.slug_hint}
            </p>
            {errors.slug && (
              <p className="text-[11px] text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t.common.creating : t.common.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
