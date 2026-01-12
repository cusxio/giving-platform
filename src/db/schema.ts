import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

import { now } from '#/core/date'

import { createId } from './create-id'

const timestamptz = () => timestamp({ withTimezone: true })

const updatedAt = () =>
  timestamptz()
    .default(sql`now()`)
    .$onUpdate(() => now())
    .notNull()

// Funds
const fundId = () => varchar({ length: 12 })
export const funds = pgTable(
  'funds',
  {
    id: fundId()
      .primaryKey()
      .$defaultFn(() => createId(12)),
    name: varchar({ length: 254 }).notNull(),
    description: text(),
    primary: boolean().default(false).notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Fund lookup by name (contribution service)
    index('funds_name_idx').on(table.name),
  ],
)

// Users
const userId = () => integer()
export const users = pgTable(
  'users',
  {
    id: serial().primaryKey(),
    email: varchar({ length: 254 }).notNull(),
    emailVerifiedAt: timestamptz(),
    firstName: varchar({ length: 32 }),
    lastName: varchar({ length: 32 }),
    role: text({ enum: ['admin', 'user', 'su'] })
      .default('user')
      .notNull(),
    status: text({ enum: ['guest', 'active', 'suspended', 'deleted'] })
      .default('guest')
      .notNull(),
    /**
     * The user's onboarding journey.
     *
     * Logic:
     * - Newly created users have no `journey` value (null). This means the user
     *   has not yet completed the onboarding form.
     *
     * - Once the user completes the onboarding form, the system checks whether
     *   the user has any guest transactions.
     *
     *   - If guest transactions exist:
     *       The user is prompted to choose their journey:
     *       - "migrate" → transfer guest transaction data into the new account.
     *       - "start_fresh" → ignore previous guest data and begin with an empty state.
     *
     *   - If no guest transactions exist:
     *       The system automatically assigns "start_fresh".
     */
    journey: text({ enum: ['start_fresh', 'migrate'] }),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Email lookup (auth, contribution service)
    uniqueIndex('users_email_idx').on(table.email),
  ],
)

export type User = InferSelectModel<typeof users>
export type UserInsert = InferInsertModel<typeof users>

// User settings
export const userSettings = pgTable('user_settings', {
  userId: userId()
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  privacyMode: boolean().default(false).notNull(),
})
export type UserSettings = InferSelectModel<typeof userSettings>

// Transactions
/**
 * The length is set to 21 to support legacy transaction IDs.
 * Note: All new transaction IDs generated for eGHL payments must be 20 characters.
 */
const transactionId = () => varchar({ length: 21 })
export const transactions = pgTable(
  'transactions',
  {
    id: transactionId()
      .primaryKey()
      /**
       * CRITICAL: This ID is sent to eGHL as the `PaymentID`, which has a length
       * requirement of 20 characters. Do not change this length.
       * @see eGHL Merchant Integration Guide v2.9w, Section 2.1, Field `PaymentID`.
       */
      .$defaultFn(() => createId(20)),
    amount: integer().notNull(),
    status: text({ enum: ['pending', 'success', 'failed'] })
      .default('pending')
      .notNull(),
    userId: userId()
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: updatedAt(),
    createdAs: text('created_as', { enum: ['user', 'guest'] }).notNull(),
  },
  (table) => [
    // User transactions with status and date filtering (overview, transactions list)
    index('transactions_user_id_status_created_at_idx').on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    // User transactions with journey filtering (overview with start_fresh)
    index('transactions_user_id_status_created_as_created_at_idx').on(
      table.userId,
      table.status,
      table.createdAs,
      table.createdAt,
    ),
    // Global status queries with date range (insights, reports)
    index('transactions_status_created_at_idx').on(
      table.status,
      table.createdAt,
    ),
    // Aggregations with amount (insights - median, percentile)
    index('transactions_status_amount_idx').on(table.status, table.amount),
    // Guest transaction existence check (welcome page)
    index('transactions_user_id_created_as_idx').on(
      table.userId,
      table.createdAs,
    ),
  ],
)

export type Transaction = InferSelectModel<typeof transactions>

export const transactionItems = pgTable(
  'transaction_items',
  {
    id: serial().primaryKey(),
    amount: integer().notNull(),
    transactionId: transactionId()
      .references(() => transactions.id, { onDelete: 'cascade' })
      .notNull(),
    fundId: fundId()
      .references(() => funds.id, { onDelete: 'restrict' })
      .notNull(),
  },
  (table) => [
    // Transaction items lookup by transaction (joins)
    index('transaction_items_transaction_id_idx').on(table.transactionId),
    // Reports aggregation - covering index
    index('transaction_items_transaction_id_fund_id_amount_idx').on(
      table.transactionId,
      table.fundId,
      table.amount,
    ),
  ],
)

export const payments = pgTable(
  'payments',
  {
    id: serial().primaryKey(),
    transactionId: transactionId()
      .references(() => transactions.id, { onDelete: 'cascade' })
      .notNull(),
    message: varchar({ length: 255 }),
    paymentMethod: varchar({ length: 10 }),
    provider: text({ enum: ['eghl', 'rm'] })
      .default('eghl')
      .notNull(),
    providerTransactionId: text(),
    paidAt: timestamptz(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Payment lookup by transaction (receipt, transaction details)
    index('payments_transaction_id_idx').on(table.transactionId),
  ],
)
export type Payment = InferSelectModel<typeof payments>
export type PaymentInsert = InferInsertModel<typeof payments>

export const savedPaymentMethods = pgTable(
  'saved_payment_methods',
  {
    id: serial().primaryKey(),
    token: varchar({ length: 50 }).notNull(),
    tokenType: varchar({ length: 3, enum: ['OCP'] }).notNull(),
    userId: userId()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    //
    cardHolder: varchar({ length: 30 }),
    cardNoMask: varchar({ length: 19 }).notNull(),
    cardExp: varchar({ length: 6 }).notNull(),
    cardType: varchar({ length: 10 }).notNull(),
    //
    lastUsedAt: timestamptz(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // User's saved cards with expiry filtering and lastUsedAt ordering
    index('saved_payment_methods_user_id_card_exp_last_used_idx').on(
      table.userId,
      table.cardExp,
      table.lastUsedAt,
    ),
    // Prevent duplicate cards per user
    uniqueIndex('saved_payment_methods_user_id_card_no_mask_card_exp_idx').on(
      table.userId,
      table.cardNoMask,
      table.cardExp,
    ),
  ],
)
export type SavedPaymentMethod = InferSelectModel<typeof savedPaymentMethods>

// Session management
const sessionId = () => varchar({ length: 21 })
export const sessions = pgTable(
  'sessions',
  {
    id: sessionId()
      .primaryKey()
      .$defaultFn(() => createId(21)),
    tokenHash: varchar({ length: 255 }).notNull(),
    userId: userId()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    expiresAt: timestamptz().notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    // Session validation - ensures unique token hashes
    uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
  ],
)

export type Session = InferSelectModel<typeof sessions>
export type SessionInsert = InferInsertModel<typeof sessions>

export const tokens = pgTable(
  'tokens',
  {
    id: serial().primaryKey(),
    tokenHash: varchar({ length: 255 }).notNull(),
    userId: userId()
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    createdAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    expiresAt: timestamptz().notNull(),
    usedAt: timestamptz(),
  },
  (table) => [
    // Token validation - scoped to user to avoid collisions (OTP space is only 10^6)
    uniqueIndex('tokens_user_id_token_hash_idx').on(
      table.userId,
      table.tokenHash,
    ),
    // Find latest valid token for user (OTP verification)
    index('tokens_user_id_expires_at_used_at_created_at_idx').on(
      table.userId,
      table.expiresAt,
      table.usedAt,
      table.createdAt,
    ),
  ],
)

export type Token = InferSelectModel<typeof tokens>
export type TokenInsert = InferInsertModel<typeof tokens>

// Rate limiting
export const rateLimitAttempts = pgTable(
  'rate_limit_attempts',
  {
    id: serial().primaryKey(),
    identifier: varchar({ length: 255 }).notNull(),
    action: text({ enum: ['otp_request', 'otp_verify'] }).notNull(),
    attemptCount: integer().default(1).notNull(),
    windowStartedAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
    lastAttemptAt: timestamptz()
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    // Lookup by identifier + action (rate limit check)
    uniqueIndex('rate_limit_attempts_identifier_action_idx').on(
      table.identifier,
      table.action,
    ),
  ],
)

export type RateLimitAttempt = InferSelectModel<typeof rateLimitAttempts>
export type RateLimitAttemptInsert = InferInsertModel<typeof rateLimitAttempts>
