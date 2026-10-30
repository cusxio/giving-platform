import { eq } from 'drizzle-orm'

import { defineQuery, firstOrNull } from '#/server/db.server'
import type { User } from '#/server/schema.server'
import { users } from '#/server/schema.server'

export type { User } from '#/server/schema.server'

export const findUserById = defineQuery(
  'account.findUserById',
  (db, userId: User['id']) => db.select().from(users).where(eq(users.id, userId)),
  firstOrNull,
)
