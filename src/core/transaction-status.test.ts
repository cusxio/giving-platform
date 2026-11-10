import { describe, expect, expectTypeOf, it } from 'vitest'

import type { Reachable, TransactionStatus } from './transaction-status'
import {
  COUNTED_STATUS,
  LISTED_STATUSES,
  TRANSACTION_STATUSES,
  TRANSITIONS,
  canMove,
  sourcesOf,
} from './transaction-status'

const REACHABLE = new Set<TransactionStatus>(['success', 'failed', 'held', 'cancelled', 'refunded'])

const isReachable = (status: TransactionStatus): status is Reachable => REACHABLE.has(status)

const inverseLists = (from: TransactionStatus, to: TransactionStatus) =>
  isReachable(to) && sourcesOf(to).includes(from)

const pairs = TRANSACTION_STATUSES.flatMap((from) =>
  TRANSACTION_STATUSES.map((to) => [from, to] as const),
)

describe('the transaction status machine', () => {
  it.each(pairs)('agrees with its inverse for %s -> %s', (from, to) => {
    expect.hasAssertions()

    const listed = (TRANSITIONS[from] as readonly TransactionStatus[]).includes(to)

    expect(canMove(from, to)).toBe(listed)
    expect(inverseLists(from, to)).toBe(listed)
  })

  it('moves out of pending, lets a success correct failed or cancelled, and never returns to pending', () => {
    expect.hasAssertions()

    expect(
      Object.fromEntries(
        TRANSACTION_STATUSES.filter((status) => isReachable(status)).map((to) => [
          to,
          sourcesOf(to),
        ]),
      ),
    ).toStrictEqual({
      cancelled: ['pending'],
      failed: ['pending'],
      held: ['pending', 'failed', 'cancelled'],
      refunded: ['pending'],
      success: ['pending', 'failed', 'cancelled'],
    })
    expect(TRANSACTION_STATUSES.filter((from) => canMove(from, 'pending'))).toStrictEqual([])
    expectTypeOf<Reachable>().toEqualTypeOf<
      'cancelled' | 'failed' | 'held' | 'refunded' | 'success'
    >()
  })

  it.each(['failed', 'cancelled'] as const)(
    'moves %s only to success or held, never to the other unpaid status',
    (from) => {
      expect.hasAssertions()

      expect(TRANSACTION_STATUSES.filter((to) => canMove(from, to))).toStrictEqual([
        'success',
        'held',
      ])
    },
  )

  it.each(['success', 'held', 'refunded'] as const)('moves nothing out of %s', (from) => {
    expect.hasAssertions()

    expect(TRANSACTION_STATUSES.filter((to) => canMove(from, to))).toStrictEqual([])
  })

  it('refuses pending as a target at compile time', () => {
    expect.hasAssertions()

    // @ts-expect-error nothing moves a row back to pending
    expect(sourcesOf('pending')).toStrictEqual([])
  })

  it('lists success, failed, cancelled and refunded in history, not pending or held, and counts only success', () => {
    expect.hasAssertions()

    expect(LISTED_STATUSES).toStrictEqual(['success', 'failed', 'cancelled', 'refunded'])
    expect(COUNTED_STATUS).toBe('success')
  })
})
