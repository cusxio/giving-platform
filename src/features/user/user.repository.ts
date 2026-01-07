import { eq, sql } from 'drizzle-orm'

import { now } from '#/core/date'
import { createDBError } from '#/core/errors'
import { ok, tryAsync } from '#/core/result'
import type { AnyDBOrTransaction, DB, DBTransaction } from '#/db/client'
import type { User, UserInsert } from '#/db/schema'
import { users } from '#/db/schema'

export class UserRepository {
  #db: DB
  constructor(db: DB) {
    this.#db = db
  }

  async createUser(
    input: Pick<UserInsert, 'email' | 'firstName' | 'lastName'>,
    db: DB | DBTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () =>
        db
          .insert(users)
          .values({ ...input, role: 'user', status: 'guest' })
          .onConflictDoUpdate({
            target: users.email,
            set: {
              role: sql`excluded.role`,
              status: sql`excluded.status`,
              firstName: sql`excluded.first_name`,
              lastName: sql`excluded.last_name`,
            },
          })
          .returning(),
      createDBError,
    )

    if (!result.ok) return result

    const user = result.value[0]
    return ok(user ?? null)
  }

  async findUserByEmail(
    email: User['email'],
    db: DB | DBTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () => db.select().from(users).where(eq(users.email, email)),
      createDBError,
    )
    if (!result.ok) return result

    const user = result.value[0]
    return ok(user ?? null)
  }

  async findUserById(userId: User['id'], db: DB | DBTransaction = this.#db) {
    const result = await tryAsync(
      () => this.findUserByIdQuery(userId, db),
      createDBError,
    )
    if (!result.ok) return result

    const user = result.value[0]
    return ok(user ?? null)
  }

  findUserByIdQuery(userId: User['id'], db: DB | DBTransaction = this.#db) {
    return db.select().from(users).where(eq(users.id, userId))
  }

  async markUserAsActiveById(
    userId: User['id'],
    db: AnyDBOrTransaction = this.#db,
  ) {
    const result = await tryAsync(
      async () =>
        db
          .update(users)
          .set({ status: 'active', emailVerifiedAt: now() })
          .where(eq(users.id, userId)),
      createDBError,
    )
    if (!result.ok) return result

    return ok()
  }

  async updateUserById(
    userId: User['id'],
    input: Pick<UserInsert, 'firstName' | 'journey' | 'lastName'>,
    db: DB | DBTransaction = this.#db,
  ) {
    const result = await tryAsync(
      () => db.update(users).set(input).where(eq(users.id, userId)).returning(),
      createDBError,
    )

    if (!result.ok) return result

    const user = result.value[0]
    return ok(user ?? null)
  }
}
