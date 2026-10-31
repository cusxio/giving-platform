import { eq, sql } from 'drizzle-orm'

import { now } from '#/core/date'
import { defineQuery, firstOrNull, nothing } from '#/server/db.server'
import type { User, UserInsert } from '#/server/schema.server'
import { users } from '#/server/schema.server'

export type { User } from '#/server/schema.server'

type ProfileChanges = Pick<UserInsert, 'firstName' | 'journey' | 'lastName'>

export const findUserById = defineQuery(
  'account.findUserById',
  (db, userId: User['id']) => db.select().from(users).where(eq(users.id, userId)),
  firstOrNull,
)

export const findUserByEmail = defineQuery(
  'account.findUserByEmail',
  (db, email: User['email']) => db.select().from(users).where(eq(users.email, email)),
  firstOrNull,
)

export const updateUserById = defineQuery(
  'account.updateUserById',
  (db, userId: User['id'], changes: ProfileChanges) =>
    db.update(users).set(changes).where(eq(users.id, userId)).returning(),
  firstOrNull,
)

/** Inserts a guest. On an email conflict the row's names, role and status are overwritten. */
export const upsertGuestUser = defineQuery(
  'account.upsertGuestUser',
  (db, input: Pick<UserInsert, 'email' | 'firstName' | 'lastName'>) =>
    db
      .insert(users)
      .values({ ...input, role: 'user', status: 'guest' })
      .onConflictDoUpdate({
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          role: sql`excluded.role`,
          status: sql`excluded.status`,
        },
        target: users.email,
      })
      .returning(),
  firstOrNull,
)

/** Marks the email verified and the account active. */
export const activateUser = defineQuery(
  'account.activateUser',
  (db, userId: User['id']) =>
    db.update(users).set({ emailVerifiedAt: now(), status: 'active' }).where(eq(users.id, userId)),
  nothing,
)
