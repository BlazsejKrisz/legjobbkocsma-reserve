'use client'

import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
  })

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    setErrorMsg(null)

    const { data, error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    setLoading(false)

    if (error) {
      setErrorMsg(error.message)
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
            Reserve Ops
          </CardTitle>
        </CardHeader>

        <CardContent>
          {errorMsg && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Email</Label>
              <Input
                {...register('email')}
                type="email"
                className="h-9 text-sm border-foreground"
              />
              {errors.email && (
                <p className="text-[11px] text-red-500">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label className="text-xs">Password</Label>
              <Input
                {...register('password')}
                type="password"
                className="h-9 text-sm border-foreground "
              />
              {errors.password && (
                <p className="text-[11px] text-red-500">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-9 text-sm font-medium mt-2"
            >
              {loading ? 'Logging in…' : 'Login'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
