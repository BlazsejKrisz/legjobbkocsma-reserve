'use client'

import { Mail, MessageSquare, X } from 'lucide-react'
import type { ChannelChoice } from '@/lib/notifications/channel'
import { useT } from '@/lib/i18n/useT'

type Props = {
  value: ChannelChoice
  onChange: (v: ChannelChoice) => void
  hasEmail: boolean
  hasPhone: boolean
  className?: string
}

// Three-way radio: Email / SMS / None.  Each option is disabled when its
// corresponding contact field is empty — picking SMS without a phone would
// queue a guaranteed-fail send.
export function ChannelPicker({ value, onChange, hasEmail, hasPhone, className }: Props) {
  const t = useT()

  const items: Array<{
    value: ChannelChoice
    label: string
    disabled: boolean
    Icon: typeof Mail
  }> = [
    { value: 'email', label: t.channel.email, disabled: !hasEmail, Icon: Mail },
    { value: 'sms',   label: t.channel.sms,   disabled: !hasPhone, Icon: MessageSquare },
    { value: 'none',  label: t.channel.none,  disabled: false,     Icon: X },
  ]

  return (
    <div className={className}>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">
        {t.channel.label}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const active = value === item.value
          return (
            <button
              key={item.value}
              type="button"
              disabled={item.disabled}
              onClick={() => onChange(item.value)}
              className={[
                'flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground hover:bg-muted/40',
                item.disabled
                  ? 'opacity-40 cursor-not-allowed hover:bg-card'
                  : 'cursor-pointer',
              ].join(' ')}
            >
              <item.Icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
        {value === 'email' && t.channel.email_desc}
        {value === 'sms' && t.channel.sms_desc}
        {value === 'none' && t.channel.none_desc}
      </p>
    </div>
  )
}
