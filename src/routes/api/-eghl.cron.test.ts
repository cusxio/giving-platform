import { drizzle } from 'drizzle-orm/neon-http'
import { describe, expect, it, vi } from 'vitest'

import { err, ok } from '#/core/result'
import { TransactionRollbackError } from '#/db/errors'
import type * as Envvars from '#/envvars'
import type { PaymentService } from '#/features/giving/payment.service'
import type { EghlQueryError } from '#/features/payment-gateway/eghl.errors'
import type { EghlQueryResponse } from '#/features/payment-gateway/eghl.schema'
import {
  EghlQueryTxnStatus,
  EghlTxnExists,
  EghlTxnStatus,
} from '#/features/payment-gateway/eghl.schema'
import type { EghlService } from '#/features/payment-gateway/eghl.service'

const mockedEnv = vi.hoisted(() => ({
  BASE_URL: 'https://app.give.test',
  CRON_SECRET: 'cron-secret',
  DATABASE_URL: 'postgres://user:pass@db.give.test/db',
  EGHL_PASSWORD: 'secret-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
}))

vi.mock<typeof Envvars>(import('#/envvars'), () => mockedEnv)

const { Route } = await import('./eghl.cron')

const { Exists, InternalError, NotFound } = EghlTxnExists
const { InternalError: QueryInternalError, NotFound: QueryNotFound } = EghlQueryTxnStatus

const NOW = new Date('2025-06-01T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
/** How drizzle sends a timestamptz parameter. */
const pgTimestamp = (date: Date) => date.toISOString().replace('Z', '+00:00')

const PENDING_SELECT =
  'select "amount", "created_at", "id" from "transactions" ' +
  'where ("transactions"."status" = $1 and "transactions"."created_at" < $2 ' +
  'and "transactions"."created_at" > $3) order by "transactions"."created_at" asc limit $4'

const MARK_FAILED_UPDATE =
  'update "transactions" set "status" = $1, "updated_at" = $2 ' +
  'where ("transactions"."id" in ($3, $4) and "transactions"."status" = $5)'

interface PendingRow {
  amountInCents: number
  createdAt: Date
  transactionId: string
}

interface LogFields {
  event?: string
  stats?: unknown
}

interface Statement {
  params: unknown[]
  sql: string
}

/**
 * A neon-http drizzle client whose driver records each statement. Selects answer with
 * `pendingRows`; updates report `updatedRows` affected rows. `failOn` makes a statement kind throw.
 */
const fakeDb = (
  pendingRows: PendingRow[],
  { failOn, updatedRows = 0 }: { failOn?: 'select' | 'update'; updatedRows?: number } = {},
) => {
  const statements: Statement[] = []
  const client = (sql: string, params: unknown[]) => {
    statements.push({ params, sql })
    const kind = sql.startsWith('select') ? 'select' : 'update'
    if (kind === failOn) {
      return Promise.reject(new Error(`${kind} failed`))
    }
    return Promise.resolve(
      kind === 'select'
        ? {
            rowCount: pendingRows.length,
            rows: pendingRows.map((row) => [
              row.amountInCents,
              row.createdAt.toISOString(),
              row.transactionId,
            ]),
          }
        : { rowCount: updatedRows, rows: [] },
    )
  }
  return { db: drizzle({ casing: 'snake_case', client: client as never }), statements }
}

const queryReply = (
  PaymentID: string,
  TxnExists: EghlTxnExists,
  TxnStatus: EghlQueryTxnStatus | EghlTxnStatus,
  TxnMessage = '',
) =>
  ({
    Amount: '50.00',
    CurrencyCode: 'MYR',
    HashValue: 'hash',
    HashValue2: 'hash2',
    OrderNumber: PaymentID,
    PaymentID,
    PymtMethod: 'ANY',
    QueryDesc: 'desc',
    ServiceID: mockedEnv.EGHL_SERVICE_ID,
    TransactionType: 'QUERY',
    TxnExists,
    TxnID: `CIV${PaymentID}`,
    TxnMessage,
    TxnStatus,
  }) as EghlQueryResponse

type QueryResult = Awaited<ReturnType<EghlService['queryTransactionStatus']>>
type FinalizeResult = Awaited<ReturnType<PaymentService['finalizePaymentFromCallback']>>

/** Stands in for eGHL's status query; a transaction without a reply gets a server error. */
const gatewayAnswering = (replies: Record<string, QueryResult>) =>
  vi.fn<EghlService['queryTransactionStatus']>(({ transactionId }) =>
    Promise.resolve(replies[transactionId] ?? err<EghlQueryError>({ type: 'EghlServerError' })),
  )

/** Finalizes every reply as a fresh settlement unless `outcomes` names its PaymentID. */
const finalizeBy =
  (outcomes: Record<string, FinalizeResult> = {}) =>
  (response: EghlQueryResponse) =>
    Promise.resolve(outcomes[response.PaymentID] ?? ok({ finalized: true }))

const notFound = (id: string) => ok(queryReply(id, NotFound, QueryNotFound))

const runCron = async ({
  authorization = `Bearer ${mockedEnv.CRON_SECRET}`,
  db,
  finalize = finalizeBy(),
  replies = {},
}: {
  authorization?: string | null
  db: ReturnType<typeof fakeDb>['db']
  finalize?: (response: EghlQueryResponse) => Promise<FinalizeResult>
  replies?: Record<string, QueryResult>
}) => {
  const handlers = Route.options.server?.handlers
  const handleGet = typeof handlers === 'object' ? handlers.GET : undefined
  if (handleGet === undefined) {
    throw new TypeError('cron route has no GET handler')
  }
  const queryTransactionStatus = gatewayAnswering(replies)
  const finalizePaymentFromCallback = vi.fn<PaymentService['finalizePaymentFromCallback']>(
    (response) => finalize(response as EghlQueryResponse),
  )
  const logger = {
    error: vi.fn<(fields: LogFields, message: string) => void>(),
    info: vi.fn<(fields: LogFields, message: string) => void>(),
    warn: vi.fn<(fields: LogFields, message: string) => void>(),
  }
  const headers = new Headers()
  if (authorization !== null) {
    headers.set('authorization', authorization)
  }
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] })
  let response
  try {
    response = await handleGet({
      context: {
        db,
        eghlService: { queryTransactionStatus },
        logger,
        paymentService: { finalizePaymentFromCallback },
      },
      request: new Request('https://app.give.test/api/eghl/cron', { headers }),
    } as never)
  } finally {
    vi.useRealTimers()
  }
  if (!(response instanceof Response)) {
    throw new TypeError('cron route did not answer with a Response')
  }
  const complete = logger.info.mock.calls.find(([fields]) => fields.event === 'eghl.cron.complete')
  return {
    body: await response.text(),
    finalizeCalls: finalizePaymentFromCallback.mock.calls,
    queried: queryTransactionStatus.mock.calls.map(([params]) => params),
    stats: complete?.[0].stats,
    status: response.status,
  }
}

const pending = (transactionId: string, ageMinutes: number): PendingRow => ({
  amountInCents: 5000,
  createdAt: minutesAgo(ageMinutes),
  transactionId,
})

describe('eGHL cron', () => {
  it('selects up to 25 pending transactions created between 2 days and 15 minutes ago', async () => {
    expect.hasAssertions()

    const { db, statements } = fakeDb([])
    const run = await runCron({ db })

    expect(run).toMatchObject({ body: 'ok', status: 200 })
    expect(statements).toStrictEqual([
      {
        params: ['pending', pgTimestamp(minutesAgo(15)), pgTimestamp(minutesAgo(2 * 24 * 60)), 25],
        sql: PENDING_SELECT,
      },
    ])
    expect(run.stats).toStrictEqual({ errors: 0, finalized: 0, found: 0, marked_failed: 0 })
  })

  it('queries each pending transaction in order and acts on the reply', async () => {
    expect.hasAssertions()

    const rows = [
      pending('txn_query_error', 20),
      pending('txn_internal_error', 40),
      pending('txn_missing_old', 45),
      pending('txn_missing_settled_meanwhile', 50),
      pending('txn_missing_recent', 20),
      pending('txn_still_pending', 40),
      pending('txn_duplicate', 40),
      pending('txn_success', 40),
      pending('txn_failed', 40),
      pending('txn_already_final', 40),
      pending('txn_finalize_error', 40),
    ]
    const reply = {
      txn_already_final: queryReply('txn_already_final', Exists, EghlTxnStatus.Success),
      txn_duplicate: queryReply(
        'txn_duplicate',
        Exists,
        EghlTxnStatus.Failed,
        'Duplicate Payment ID',
      ),
      txn_failed: queryReply('txn_failed', Exists, EghlTxnStatus.Failed, 'Card declined'),
      txn_finalize_error: queryReply('txn_finalize_error', Exists, EghlTxnStatus.Success),
      txn_internal_error: queryReply('txn_internal_error', InternalError, QueryInternalError),
      txn_missing_old: queryReply('txn_missing_old', NotFound, QueryNotFound),
      txn_missing_settled_meanwhile: queryReply(
        'txn_missing_settled_meanwhile',
        NotFound,
        QueryNotFound,
      ),
      txn_missing_recent: queryReply('txn_missing_recent', NotFound, QueryNotFound),
      txn_still_pending: queryReply('txn_still_pending', Exists, EghlTxnStatus.Pending),
      txn_success: queryReply('txn_success', Exists, EghlTxnStatus.Success),
    }
    const replies = Object.fromEntries(Object.entries(reply).map(([id, r]) => [id, ok(r)]))
    const { db, statements } = fakeDb(rows, { updatedRows: 1 })

    const run = await runCron({
      db,
      finalize: finalizeBy({
        txn_already_final: ok({ finalized: false }),
        txn_finalize_error: err({
          error: new TransactionRollbackError('rolled back'),
          type: 'TransactionRollbackError',
        }),
      }),
      replies,
    })

    expect(run).toMatchObject({ body: 'ok', status: 200 })
    expect(run.queried).toStrictEqual(
      rows.map(({ amountInCents, transactionId }) => ({ amountInCents, transactionId })),
    )
    expect(run.finalizeCalls).toStrictEqual([
      [reply.txn_success, 'success'],
      [reply.txn_failed, 'failed'],
      [reply.txn_already_final, 'success'],
      [reply.txn_finalize_error, 'success'],
    ])
    expect(statements.slice(1)).toStrictEqual([
      {
        params: [
          'failed',
          pgTimestamp(NOW),
          'txn_missing_old',
          'txn_missing_settled_meanwhile',
          'pending',
        ],
        sql: MARK_FAILED_UPDATE,
      },
    ])
    expect(run.stats).toStrictEqual({ errors: 3, finalized: 2, found: 11, marked_failed: 1 })
  })

  it('counts every transaction it could not mark failed as an error', async () => {
    expect.hasAssertions()

    const { db, statements } = fakeDb([pending('txn_a', 45), pending('txn_b', 31)], {
      failOn: 'update',
    })

    const run = await runCron({
      db,
      replies: { txn_a: notFound('txn_a'), txn_b: notFound('txn_b') },
    })

    expect(run).toMatchObject({ body: 'ok', status: 200 })
    expect(statements[1]?.params).toStrictEqual([
      'failed',
      pgTimestamp(NOW),
      'txn_a',
      'txn_b',
      'pending',
    ])
    expect(run.stats).toStrictEqual({ errors: 2, finalized: 0, found: 2, marked_failed: 0 })
  })

  it('answers 500 without querying eGHL when the pending select fails', async () => {
    expect.hasAssertions()

    const { db } = fakeDb([pending('txn_a', 40)], { failOn: 'select' })
    const run = await runCron({ db })

    expect(run).toMatchObject({ body: 'Internal Server Error', queried: [], status: 500 })
  })

  it.each([
    ['no authorization header', null],
    ['a wrong secret', 'Bearer not-the-secret'],
    ['the secret without the Bearer scheme', mockedEnv.CRON_SECRET],
  ])('answers 401 without touching the database for %s', async (_case, authorization) => {
    expect.hasAssertions()

    const { db, statements } = fakeDb([pending('txn_a', 40)])
    const run = await runCron({ authorization, db })

    expect(run).toMatchObject({ body: 'Unauthorized', queried: [], status: 401 })
    expect(statements).toStrictEqual([])
  })
})
