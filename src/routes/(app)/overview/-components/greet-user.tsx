import { useMemo } from 'react'

import { clientTz, now } from '#/core/date'
import type { User } from '#/db/schema'

interface GreetUserProps {
  user: Pick<User, 'firstName' | 'lastName'>
}

export function GreetUser(props: GreetUserProps) {
  const { user } = props

  const greeting = useMemo(() => {
    const date = now(clientTz)
    const hour = date.getHours()

    if (hour >= 6 && hour < 12) return 'Good morning'
    if (hour >= 12 && hour < 17) return 'Good afternoon'
    if (hour >= 17 && hour < 20) return 'Good evening'
    if (hour >= 20 || hour < 6) return 'Good night'

    return 'Welcome back'
  }, [])

  return (
    <h1 className="px-4">
      <span className="text-sm text-fg-muted">{greeting},</span>
      <br />
      <span>
        {user.firstName} {user.lastName}
      </span>
    </h1>
  )
}
