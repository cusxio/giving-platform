import { eq } from 'drizzle-orm'

import { defineQuery, firstOrNull } from '#/server/db.server'
import type { User, UserInsert } from '#/server/schema.server'
import { users } from '#/server/schema.server'

export type { User } from '#/server/schema.server'

type ProfileChanges = Pick<UserInsert, 'firstName' | 'journey' | 'lastName'>

export const findUserById = defineQuery(
  'account.findUserById',
  (db, userId: User['id']) => db.select().from(users).where(eq(users.id, userId)),
  firstOrNull,
)

export const updateUserById = defineQuery(
  'account.updateUserById',
  (db, userId: User['id'], changes: ProfileChanges) =>
    db.update(users).set(changes).where(eq(users.id, userId)).returning(),
  firstOrNull,
)
