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

type Props = {
  open: boolean
  onClose: () => void
}

export function CreateVenueDialog({ open, onClose }: Props) {
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create venue</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input {...register('name')} className="h-9 text-sm" placeholder="My Venue" />
            {errors.name && (
              <p className="text-[11px] text-red-400">{errors.name.message}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Slug</Label>
            <Input
              {...register('slug')}
              className="h-9 text-sm"
              placeholder="my-venue"
            />
            <p className="text-[10px] text-muted-foreground">
              Lowercase letters, numbers and hyphens only.
            </p>
            {errors.slug && (
              <p className="text-[11px] text-red-400">{errors.slug.message}</p>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
