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
  (db, userId: User['id'], { firstName, journey, lastName }: ProfileChanges) =>
    db.update(users).set({ firstName, journey, lastName }).where(eq(users.id, userId)).returning(),
  firstOrNull,
)

/**
 * Inserts a guest, or returns the guest who has the email, filling in only the names it lacks.
 * Null when a registered account has the email; that row is left exactly as it is.
 */
export const upsertGuestUser = defineQuery(
  'account.upsertGuestUser',
  (db, input: Pick<UserInsert, 'email' | 'firstName' | 'lastName'>) =>
    db
      .insert(users)
      .values({ ...input, role: 'user', status: 'guest' })
      .onConflictDoUpdate({
        set: {
          firstName: sql`coalesce(${users.firstName}, excluded.first_name)`,
          lastName: sql`coalesce(${users.lastName}, excluded.last_name)`,
        },
        setWhere: eq(users.status, 'guest'),
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
