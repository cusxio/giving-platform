import { createFileRoute } from '@tanstack/react-router'
import * as v from 'valibot'

import { config } from '#/core/brand/config'
import { AuthForm } from '#/features/auth/components/auth-form'

const searchSchema = v.object({ email: v.optional(v.pipe(v.string(), v.toLowerCase(), v.email())) })

export const Route = createFileRoute('/(auth)/auth/login')({
  component: RouteComponent,

  head: () => ({ meta: [{ title: `Login · ${config.entity}` }] }),

  validateSearch(search) {
    const parseResult = v.safeParse(searchSchema, search)

    if (!parseResult.success) {
      return { email: undefined }
    }

    return parseResult.output
  },
})

function RouteComponent() {
  const { email } = Route.useSearch()

  return <AuthForm email={email} mode="login" />
}
