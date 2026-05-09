'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useLang } from '@/lib/i18n/context'
import { translations } from '@/lib/i18n/translations'

// Modern guidance is 8+ characters; we keep 6 to avoid breaking existing
// users with shorter passwords, but flag them on next rotation.
const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const { lang } = useLang()
  const t = translations[lang].login

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const onSubmit = async (values: FormValues) => {
    setErrorMsg(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      // Supabase distinguishes some error states textually
      // ("Invalid login credentials" vs "Email not confirmed" vs
      // rate-limit messages).  Surfacing those raw leaks
      // account-existence — a "Email not confirmed" reply confirms
      // the address is registered.  Map every auth failure to a
      // single user-facing message and log the original for ops.
      console.warn('[auth/login] sign-in failed:', error.message)
      setErrorMsg(t.error_invalid)
      return
    }

    if (data.session) {
      router.replace('/dashboard')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border bg-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg font-semibold text-center">
            Legjobb<span className="text-primary">Kocsma</span>
          </CardTitle>
        </CardHeader>

        <CardContent>
          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="flex flex-col gap-1">
              <Label htmlFor="login-email" className="text-xs">
                {t.email_label}
              </Label>
              <Input
                {...register('email')}
                id="login-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                className="h-9 text-sm border-foreground"
              />
              {errors.email && (
                <p id="login-email-error" className="text-[11px] text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="login-password" className="text-xs">
                {t.password_label}
              </Label>
              <Input
                {...register('password')}
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'login-password-error' : undefined}
                className="h-9 text-sm border-foreground"
              />
              {errors.password && (
                <p id="login-password-error" className="text-[11px] text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full h-9 text-sm font-medium mt-2"
            >
              {isSubmitting ? t.submitting : t.submit}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
