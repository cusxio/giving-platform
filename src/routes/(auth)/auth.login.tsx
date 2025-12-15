import { createFileRoute } from '@tanstack/react-router'
import { Type } from 'typebox'
import type { Static } from 'typebox'
import { Compile } from 'typebox/compile'

import { config } from '#/core/brand/config'
import { createParseError } from '#/core/errors'
import { trySync } from '#/core/result'
import { AuthForm } from '#/features/auth/components/auth-form'

const schema = Compile(
  Type.Object({ email: Type.Optional(Type.String({ format: 'email' })) }),
)

export const Route = createFileRoute('/(auth)/auth/login')({
  validateSearch(search): Static<typeof schema> {
    const parseResult = trySync(() => schema.Parse(search), createParseError)

    if (!parseResult.ok) {
      return { email: undefined }
    }

    const { email } = parseResult.value
    return { email }
  },

  head: () => ({ meta: [{ title: `Login · ${config.entity}` }] }),

  component: RouteComponent,
})

function RouteComponent() {
  const { email } = Route.useSearch()

  return <AuthForm email={email} mode="login" />
}
