import type { InferInsertModel } from 'drizzle-orm'
import { and, desc, eq, gte, sql } from 'drizzle-orm'

import { clientTz, now } from '#/core/date'
import { defineQuery, firstOrNull, nothing, rows } from '#/server/db.server'
import type { User } from '#/server/schema.server'
import { savedPaymentMethods } from '#/server/schema.server'
import type { SameLength } from '#/server/sql.server'

import type { CARD_FIELD_LENGTHS } from './eghl.wire'

/** The user's saved cards that have not expired yet, most recently used first. */
export const unexpiredSavedCards = defineQuery(
  'payments.unexpiredSavedCards',
  (db, userId: User['id']) => {
    const currentYearMonth = sql<string>`TO_CHAR(NOW() AT TIME ZONE ${clientTz}, 'YYYYMM')`

    return db
      .select()
      .from(savedPaymentMethods)
      .where(
        and(
          eq(savedPaymentMethods.userId, userId),
          gte(savedPaymentMethods.cardExp, currentYearMonth),
        ),
      )
      .orderBy(desc(savedPaymentMethods.lastUsedAt))
  },
  rows,
)

/** The card, if the user saved it. Charging a token checks ownership with this first. */
export const findSavedCard = defineQuery(
  'payments.findSavedCard',
  (db, userId: User['id'], token: string) =>
    db
      .select({ id: savedPaymentMethods.id })
      .from(savedPaymentMethods)
      .where(and(eq(savedPaymentMethods.userId, userId), eq(savedPaymentMethods.token, token)))
      .limit(1),
  firstOrNull,
)

/** @public */
export const cardFieldsFitColumns: [
  SameLength<(typeof CARD_FIELD_LENGTHS)['CardExp'], typeof savedPaymentMethods.cardExp>,
  SameLength<(typeof CARD_FIELD_LENGTHS)['CardHolder'], typeof savedPaymentMethods.cardHolder>,
  SameLength<(typeof CARD_FIELD_LENGTHS)['CardNoMask'], typeof savedPaymentMethods.cardNoMask>,
  SameLength<(typeof CARD_FIELD_LENGTHS)['CardType'], typeof savedPaymentMethods.cardType>,
  SameLength<(typeof CARD_FIELD_LENGTHS)['Token'], typeof savedPaymentMethods.token>,
] = [true, true, true, true, true]

type NewSavedCard = Pick<
  InferInsertModel<typeof savedPaymentMethods>,
  'cardExp' | 'cardHolder' | 'cardNoMask' | 'cardType' | 'token' | 'userId'
>

/** Saves the card a user just paid with. A card the user already saved gets the new token. */
export const upsertSavedCard = defineQuery(
  'payments.upsertSavedCard',
  (db, card: NewSavedCard) =>
    db
      .insert(savedPaymentMethods)
      .values({
        cardExp: card.cardExp,
        cardHolder: card.cardHolder,
        cardNoMask: card.cardNoMask,
        cardType: card.cardType,
        lastUsedAt: now(),
        token: card.token,
        tokenType: 'OCP',
        userId: card.userId,
      })
      .onConflictDoUpdate({
        set: {
          token: sql`excluded.token`, // Token might rotate
          lastUsedAt: now(),
        },
        target: [
          savedPaymentMethods.userId,
          savedPaymentMethods.cardNoMask,
          savedPaymentMethods.cardExp,
        ],
      }),
  nothing,
)

/** Marks the user's saved card as just used. */
export const touchSavedCard = defineQuery(
  'payments.touchSavedCard',
  (db, userId: User['id'], token: string) =>
    db
      .update(savedPaymentMethods)
      .set({ lastUsedAt: now() })
      .where(and(eq(savedPaymentMethods.userId, userId), eq(savedPaymentMethods.token, token))),
  nothing,
)
