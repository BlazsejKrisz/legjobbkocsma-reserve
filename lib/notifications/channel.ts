import type { NotificationChannel } from './types'

export type ChannelChoice = NotificationChannel | 'none'

// Picks the default channel based on what contact info is available.
// Used when the staff doesn't explicitly pick — match the obvious choice.
export function defaultChannel(args: {
  hasEmail: boolean
  hasPhone: boolean
}): ChannelChoice {
  if (args.hasEmail) return 'email'   // email is more reliable / cheaper
  if (args.hasPhone) return 'sms'
  return 'none'
}

// Validates that the requested channel is actually possible.  E.g. picking
// SMS when no phone is present should fall back to 'none' rather than queue
// a guaranteed failure.
export function resolveChannel(args: {
  desired: ChannelChoice
  hasEmail: boolean
  hasPhone: boolean
}): ChannelChoice {
  if (args.desired === 'email' && !args.hasEmail) return 'none'
  if (args.desired === 'sms' && !args.hasPhone) return 'none'
  return args.desired
}
