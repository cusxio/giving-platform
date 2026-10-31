import { describe, expect, it } from 'vitest'

import { contributionItems, decideDonor, fundName, itemsFor, totalInCents } from './contribution'

const guest = { id: 7, status: 'guest' as const }
const registered = { id: 7, status: 'active' as const }

describe('deciding whose contribution it is', () => {
  it.each([
    { expected: { kind: 'guest' }, owner: null, session: null },
    { expected: { kind: 'guest' }, owner: guest, session: null },
    { expected: { kind: 'guest-email-exists' }, owner: registered, session: null },
    { expected: { kind: 'session-user', userId: 2 }, owner: null, session: { id: 2 } },
    { expected: { kind: 'session-user', userId: 7 }, owner: registered, session: { id: 7 } },
    { expected: { kind: 'email-belongs-to-another-user' }, owner: guest, session: { id: 2 } },
    { expected: { kind: 'email-belongs-to-another-user' }, owner: registered, session: { id: 2 } },
  ])('is $expected.kind for owner $owner and session $session', ({ expected, owner, session }) => {
    expect.hasAssertions()

    expect(decideDonor(owner, session)).toStrictEqual(expected)
  })
})

describe('contribution items', () => {
  it('converts ringgit to cents and leaves out funds given nothing', () => {
    expect.hasAssertions()

    const items = contributionItems({ future: 0, mission: 2.25, offering: 10, tithe: 0.004 })

    expect(items).toStrictEqual([
      { amountInCents: 225, fund: 'mission' },
      { amountInCents: 1000, fund: 'offering' },
    ])
    expect(totalInCents(items)).toBe(1225)
  })

  it('names each fund as the funds table does', () => {
    expect.hasAssertions()

    expect(['offering', 'tithe'].map((f) => fundName(f as 'offering'))).toStrictEqual([
      'Offering',
      'Tithe',
    ])
  })

  it('becomes rows of the transaction keyed by fund id', () => {
    expect.hasAssertions()

    const at = new Date(0)
    const funds = [
      {
        createdAt: at,
        description: null,
        id: 'fund_t',
        name: 'Tithe',
        primary: false,
        updatedAt: at,
      },
    ]

    expect(itemsFor('txn_1', [{ amountInCents: 300, fund: 'tithe' }], funds)).toStrictEqual([
      { amount: 300, fundId: 'fund_t', transactionId: 'txn_1' },
    ])
    expect(() => itemsFor('txn_1', [{ amountInCents: 300, fund: 'future' }], funds)).toThrow(
      'Invalid fund name: Future',
    )
  })
})
