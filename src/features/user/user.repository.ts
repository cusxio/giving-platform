import { eq, sql } from 'drizzle-orm'

import { now } from '#/core/date'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { AnyDBOrTransaction, DB } from '#/server/neon.server'
import type { User, UserInsert } from '#/server/schema.server'
import { users } from '#/server/schema.server'

export class UserRepository {
  readonly #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  async createUser(
    input: Pick<UserInsert, 'email' | 'firstName' | 'lastName'>,
    db: AnyDBOrTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () =>
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
      createDBError,
    )

    if (!result.ok) {
      return result
    }

    const [user] = result.value
    return ok(user ?? null)
  }

  async findUserByEmail(email: User['email'], db: AnyDBOrTransaction = this.#db) {
    const result = await tryAsync(
      () => db.select().from(users).where(eq(users.email, email)),
      createDBError,
    )
    if (!result.ok) {
      return result
    }

    const [user] = result.value
    return ok(user ?? null)
  }

  markUserAsActiveByIdQuery(userId: User['id'], db: AnyDBOrTransaction = this.#db) {
    return db
      .update(users)
      .set({ emailVerifiedAt: now(), status: 'active' })
      .where(eq(users.id, userId))
  }
}
