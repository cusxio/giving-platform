import { SpanStatusCode } from '@opentelemetry/api'
import { Result } from 'better-result'
import { describe, expect, it, vi } from 'vitest'

import type { Deps } from '#/server/deps.server'
import { infra } from '#/server/infra-error'
import { createDriverDb } from '#/server/testing/driver-db'
import { recordingLogger } from '#/server/testing/recording-logger'
import { inRequestSpan } from '#/server/testing/spans'
import { testDeps } from '#/server/testing/test-deps'

import { EghlGatewayBusyError, EghlServerError } from './eghl.errors'
import type { PaymentGateway } from './gateway'
import type { PaymentOutcome, Settling } from './payment-outcome'
import { targetOf, transactionIdOf } from './payment-outcome'
import { handleReconcile } from './reconcile.server'
import type { Recorded, recordOutcome } from './record-outcome.server'

type FinalizeResult = Awaited<ReturnType<typeof recordOutcome>>

const settlement = vi.hoisted(() => ({
  finalize: (_outcome: unknown, _source: unknown): Promise<FinalizeResult> => {
    throw new Error('runCron sets finalize')
  },
}))

vi.mock(import('./record-outcome.server'), () => ({
  recordOutcome: (_deps, outcome, source) => settlement.finalize(outcome, source),
}))

const settings = { CRON_SECRET: 'cron-secret', EGHL_SERVICE_ID: testDeps().config.eghl.serviceId }

const NOW = new Date('2025-06-01T12:00:00Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)
/** How drizzle sends a timestamptz parameter. */
const pgTimestamp = (date: Date) => date.toISOString().replace('Z', '+00:00')

const PENDING_SELECT =
  'select "amount", "created_at", "id" from "transactions" ' +
  'where ("transactions"."status" = $1 and "transactions"."created_at" < $2 ' +
  'and "transactions"."created_at" > $3) order by "transactions"."created_at" asc limit $4'

const STALE_COUNT =
  'select count(*) from "transactions" ' +
  'where ("transactions"."status" = $1 and "transactions"."created_at" <= $2)'

interface PendingRow {
  amountInCents: number
  createdAt: Date
  transactionId: string
}

interface LogFields {
  [field: string]: unknown
  event?: string
  stats?: unknown
}

interface Statement {
  params: unknown[]
  sql: string
}

type StatementKind = 'count' | 'select' | 'update'

const kindOf = (sql: string): StatementKind => {
  if (sql.startsWith('select count(')) {
    return 'count'
  }
  return sql.startsWith('select') ? 'select' : 'update'
}

const fakeDb = (
  pendingRows: PendingRow[],
  {
    failOn,
    stalePending = 0,
    updatedRows = 0,
  }: { failOn?: StatementKind; stalePending?: number; updatedRows?: number } = {},
) => {
  const statements: Statement[] = []
  const answers: Record<StatementKind, () => { rowCount: number; rows: unknown[][] }> = {
    count: () => ({ rowCount: 1, rows: [[stalePending]] }),
    select: () => ({
      rowCount: pendingRows.length,
      rows: pendingRows.map((row) => [
        row.amountInCents,
        row.createdAt.toISOString(),
        row.transactionId,
      ]),
    }),
    update: () => ({ rowCount: updatedRows, rows: [] }),
  }
  const client = (sql: string, params: unknown[]) => {
    statements.push({ params, sql })
    const kind = kindOf(sql)
    if (kind === failOn) {
      return Promise.reject(new Error(`${kind} failed`))
    }
    return Promise.resolve(answers[kind]())
  }
  return { db: createDriverDb(client), statements }
}

const answer = (
  transactionId: string,
  kind: 'failed' | 'pending' | 'succeeded',
): PaymentOutcome => {
  const record = {
    amountInCents: 5000,
    currency: 'MYR',
    message: '',
    method: 'ANY',
    paidAt: null,
    providerTxnId: `CIV${transactionId}`,
    transactionId,
  }
  switch (kind) {
    case 'succeeded': {
      return { card: null, kind, record }
    }
    case 'pending': {
      return { answer: 'gateway_pending', kind, record }
    }
    case 'failed': {
      return { kind, record }
    }
    default: {
      return kind satisfies never
    }
  }
}

type QueryResult = Awaited<ReturnType<PaymentGateway['queryStatus']>>

/** Stands in for eGHL's status query; a transaction without a reply gets a server error. */
const gatewayAnswering = (replies: Record<string, QueryResult>) =>
  vi.fn<PaymentGateway['queryStatus']>(({ transactionId }) =>
    Promise.resolve(replies[transactionId] ?? Result.err(new EghlServerError())),
  )

/** Finalizes every reply as a fresh settlement unless `outcomes` names its PaymentID. */
const finalizeBy =
  (outcomes: Record<string, FinalizeResult> = {}) =>
  (outcome: Settling) =>
    Promise.resolve(
      outcomes[transactionIdOf(outcome)] ??
        Result.ok<Recorded>({
          from: 'pending',
          kind: 'moved',
          to: targetOf(outcome),
          via: outcome.kind,
        }),
    )

const notFound = () => Result.ok<PaymentOutcome>({ kind: 'notFound' })

const runCron = async ({
  authorization = `Bearer ${settings.CRON_SECRET}`,
  config = { cronSecret: settings.CRON_SECRET },
  db,
  finalize = finalizeBy(),
  replies = {},
}: {
  authorization?: string | null
  config?: Pick<Deps['config'], 'cronSecret'>
  db: ReturnType<typeof fakeDb>['db']
  finalize?: (outcome: Settling) => Promise<FinalizeResult>
  replies?: Record<string, QueryResult>
}) => {
  const queryTransactionStatus = gatewayAnswering(replies)
  const finalizePaymentFromCallback = vi.fn<typeof settlement.finalize>((outcome) =>
    finalize(outcome as Settling),
  )
  settlement.finalize = finalizePaymentFromCallback
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
    const base = testDeps()
    response = await handleReconcile(
      {
        config: { ...base.config, ...config },
        db,
        eghl: { ...base.eghl, queryStatus: queryTransactionStatus },
        logger: logger as unknown as Deps['logger'],
      },
      new Request('https://app.give.test/api/eghl/cron', { headers }),
    )
  } finally {
    vi.useRealTimers()
  }
  if (!(response instanceof Response)) {
    throw new TypeError('cron route did not answer with a Response')
  }
  const completeAt = (level: 'info' | 'warn') =>
    logger[level].mock.calls.find(([fields]) => fields.event === 'eghl.cron.complete')?.[0]
  const completeLevel = (['info', 'warn'] as const).find((level) => completeAt(level))
  return {
    body: await response.text(),
    completeLevel,
    errors: logger.error.mock.calls.map(([fields]) => fields),
    finalizeCalls: finalizePaymentFromCallback.mock.calls,
    queried: queryTransactionStatus.mock.calls.map(([params]) => params),
    stats: completeLevel && completeAt(completeLevel)?.stats,
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

    expect(run).toMatchObject({ body: 'ok', completeLevel: 'info', status: 200 })
    expect(statements).toStrictEqual([
      {
        params: ['pending', pgTimestamp(minutesAgo(15)), pgTimestamp(minutesAgo(2 * 24 * 60)), 25],
        sql: PENDING_SELECT,
      },
      { params: ['pending', pgTimestamp(minutesAgo(2 * 24 * 60))], sql: STALE_COUNT },
    ])
    expect(run.stats).toStrictEqual({
      errors: 0,
      finalized: 0,
      found: 0,
      marked_failed: 0,
      stale_pending: 0,
    })
  })

  it('reports the pending transactions past its window at warn level', async () => {
    expect.hasAssertions()

    const { db } = fakeDb([], { stalePending: 3 })
    const run = await runCron({ db })

    expect(run).toMatchObject({ body: 'ok', completeLevel: 'warn', status: 200 })
    expect(run.stats).toStrictEqual({
      errors: 0,
      finalized: 0,
      found: 0,
      marked_failed: 0,
      stale_pending: 3,
    })
  })

  it('settles the window and logs the failure when the stale count fails', async () => {
    expect.hasAssertions()

    const { db } = fakeDb([pending('txn_a', 40)], { failOn: 'count' })
    const run = await runCron({ db, replies: { txn_a: Result.ok(answer('txn_a', 'succeeded')) } })

    expect(run).toMatchObject({ body: 'ok', completeLevel: 'info', status: 200 })
    expect(run.finalizeCalls).toHaveLength(1)
    expect(run.stats).toStrictEqual({ errors: 0, finalized: 1, found: 1, marked_failed: 0 })
    expect(run.errors).toMatchObject([
      { event: 'eghl.cron.failed', op: 'payments.countStalePending' },
    ])
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
      txn_already_final: answer('txn_already_final', 'succeeded'),
      txn_duplicate: answer('txn_duplicate', 'pending'),
      txn_failed: answer('txn_failed', 'failed'),
      txn_finalize_error: answer('txn_finalize_error', 'succeeded'),
      txn_missing_old: { kind: 'notFound' },
      txn_missing_settled_meanwhile: { kind: 'notFound' },
      txn_missing_recent: { kind: 'notFound' },
      txn_still_pending: answer('txn_still_pending', 'pending'),
      txn_success: answer('txn_success', 'succeeded'),
    }
    const replies = {
      ...Object.fromEntries(Object.entries(reply).map(([id, r]) => [id, Result.ok(r)])),
      txn_internal_error: Result.err(new EghlGatewayBusyError({ queryDesc: 'desc' })),
    }
    const { db, statements } = fakeDb(rows, { updatedRows: 1 })

    const run = await runCron({
      db,
      finalize: finalizeBy({
        txn_already_final: Result.ok({ at: 'success', kind: 'absorbed', why: 'replay' } as const),
        txn_missing_settled_meanwhile: Result.ok({
          at: 'success',
          kind: 'absorbed',
          why: 'contradiction',
        } as const),
        txn_finalize_error: Result.err(infra('payments.insertPayment', new Error('rolled back'))),
      }),
      replies,
    })

    expect(run).toMatchObject({
      body: 'ok',
      errors: [
        { 'error.type': 'EghlServerError', event: 'eghl.cron.query_failed' },
        {
          event: 'eghl.cron.failed',
          op: 'payments.insertPayment',
          transaction_id: 'txn_finalize_error',
        },
      ],
      status: 200,
    })
    expect(run.queried).toStrictEqual(
      rows.map(({ amountInCents, transactionId }) => ({ amountInCents, transactionId })),
    )
    expect(run.finalizeCalls).toStrictEqual([
      [{ kind: 'expired', transactionId: 'txn_missing_old' }, 'cron'],
      [{ kind: 'expired', transactionId: 'txn_missing_settled_meanwhile' }, 'cron'],
      [reply.txn_success, 'cron'],
      [reply.txn_failed, 'cron'],
      [reply.txn_already_final, 'cron'],
      [reply.txn_finalize_error, 'cron'],
    ])
    expect(statements.map(({ sql }) => sql)).toStrictEqual([PENDING_SELECT, STALE_COUNT])
    expect(run.stats).toStrictEqual({
      errors: 3,
      finalized: 2,
      found: 11,
      marked_failed: 1,
      stale_pending: 0,
    })
  })

  it('counts a success held for its money as an error, not as finalized', async () => {
    expect.hasAssertions()

    const { db } = fakeDb([pending('txn_held', 40)])
    const run = await runCron({
      db,
      finalize: finalizeBy({
        txn_held: Result.ok({ kind: 'held', why: 'currency_mismatch' } as const),
      }),
      replies: { txn_held: Result.ok(answer('txn_held', 'succeeded')) },
    })

    expect(run.stats).toStrictEqual({
      errors: 1,
      finalized: 0,
      found: 1,
      marked_failed: 0,
      stale_pending: 0,
    })
  })

  it('fails each expired row on its own and counts each one it could not write', async () => {
    expect.hasAssertions()

    const { db } = fakeDb([pending('txn_a', 45), pending('txn_b', 31)])
    const writeFailed = Result.err(infra('payments.moveTransaction', new Error('update failed')))

    const run = await runCron({
      db,
      finalize: finalizeBy({ txn_a: writeFailed, txn_b: writeFailed }),
      replies: { txn_a: notFound(), txn_b: notFound() },
    })

    expect(run).toMatchObject({ body: 'ok', status: 200 })
    expect(run.finalizeCalls).toStrictEqual([
      [{ kind: 'expired', transactionId: 'txn_a' }, 'cron'],
      [{ kind: 'expired', transactionId: 'txn_b' }, 'cron'],
    ])
    expect(run.stats).toStrictEqual({
      errors: 2,
      finalized: 0,
      found: 2,
      marked_failed: 0,
      stale_pending: 0,
    })
    expect(run.errors).toMatchObject([
      { event: 'eghl.cron.failed', op: 'payments.moveTransaction', transaction_id: 'txn_a' },
      { event: 'eghl.cron.failed', op: 'payments.moveTransaction', transaction_id: 'txn_b' },
    ])
  })

  it('answers 200 for a run where one settlement failed, and fails the request span', async () => {
    expect.hasAssertions()

    const { db } = fakeDb([pending('txn_a', 40), pending('txn_b', 40)])
    const { settled, span } = await inRequestSpan(() =>
      runCron({
        db,
        finalize: finalizeBy({
          txn_a: Result.err(infra('payments.insertPayment', new Error('rolled back'))),
        }),
        replies: {
          txn_a: Result.ok(answer('txn_a', 'succeeded')),
          txn_b: Result.ok(answer('txn_b', 'succeeded')),
        },
      }),
    )

    expect(settled).toMatchObject({
      status: 'fulfilled',
      value: {
        stats: { errors: 1, finalized: 1, found: 2, marked_failed: 0, stale_pending: 0 },
        status: 200,
      },
    })
    expect(span.status).toStrictEqual({
      code: SpanStatusCode.ERROR,
      message: 'payments.insertPayment failed',
    })
  })

  it('logs a thrown defect once as eghl.cron.defect, fails the span and rethrows it', async () => {
    expect.hasAssertions()

    const { events, logger } = recordingLogger()
    const { db } = fakeDb([pending('txn_a', 40)])
    const bug = new TypeError('settlement bug')
    settlement.finalize = () => Promise.reject(bug)
    const base = testDeps()
    const reply = Result.ok(answer('txn_a', 'succeeded'))

    const { settled, span } = await inRequestSpan(() =>
      handleReconcile(
        {
          config: { ...base.config, cronSecret: settings.CRON_SECRET },
          db,
          eghl: { ...base.eghl, queryStatus: () => Promise.resolve(reply) },
          logger,
        },
        new Request('https://app.give.test/api/eghl/cron', {
          headers: { authorization: `Bearer ${settings.CRON_SECRET}` },
        }),
      ),
    )

    expect(settled).toStrictEqual({ reason: bug, status: 'rejected' })
    expect(events.filter(({ level }) => level >= 50)).toMatchObject([
      {
        'error.type': 'TypeError',
        err: { message: 'settlement bug', type: 'TypeError' },
        event: 'eghl.cron.defect',
        msg: 'Unhandled defect',
      },
    ])
    expect(span.status.code).toBe(SpanStatusCode.ERROR)
  })

  it('answers 500 without querying eGHL when the pending select fails', async () => {
    expect.hasAssertions()

    const { db } = fakeDb([pending('txn_a', 40)], { failOn: 'select' })
    const run = await runCron({ db })

    expect(run).toMatchObject({ body: 'Internal Server Error', queried: [], status: 500 })
    expect(run.errors).toMatchObject([
      { event: 'eghl.cron.failed', op: 'payments.pendingTransactionsToReconcile' },
    ])
  })

  it.each([
    ['no authorization header', null],
    ['a wrong secret', 'Bearer not-the-secret'],
    ['the secret without the Bearer scheme', settings.CRON_SECRET],
  ])('answers 401 without touching the database for %s', async (_case, authorization) => {
    expect.hasAssertions()

    const { db, statements } = fakeDb([pending('txn_a', 40)])
    const run = await runCron({ authorization, db })

    expect(run).toMatchObject({ body: 'Unauthorized', queried: [], status: 401 })
    expect(statements).toStrictEqual([])
  })

  it.each([
    ['an empty secret', '', 'Bearer '],
    ['an unset secret', undefined, 'Bearer undefined'],
  ])('answers 401 to every call under %s', async (_case, cronSecret, authorization) => {
    expect.hasAssertions()

    const { db, statements } = fakeDb([pending('txn_a', 40)])
    const run = await runCron({ authorization, config: { cronSecret }, db })

    expect(run).toMatchObject({ body: 'Unauthorized', queried: [], status: 401 })
    expect(statements).toStrictEqual([])
  })
})
