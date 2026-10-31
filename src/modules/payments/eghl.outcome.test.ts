import { describe, expect, it } from 'vitest'

import { finalStatusOf, inboundActionOf } from './eghl.outcome'
import { EghlQueryTxnStatus, EghlTxnExists, EghlTxnStatus } from './eghl.wire'

describe('eGHL inbound reply action', () => {
  it('settles a successful reply directly', () => {
    expect.hasAssertions()

    expect(inboundActionOf({ TxnStatus: EghlTxnStatus.Success })).toBe('settle-success')
  })

  it('confirms a failed reply with a status query', () => {
    expect.hasAssertions()

    expect(inboundActionOf({ TxnStatus: EghlTxnStatus.Failed })).toBe('confirm-by-query')
  })

  it('leaves a pending reply pending', () => {
    expect.hasAssertions()

    expect(inboundActionOf({ TxnStatus: EghlTxnStatus.Pending })).toBe('leave-pending')
  })
})

describe('eGHL query reply finality', () => {
  const exists = { TxnExists: EghlTxnExists.Exists }

  it('settles a successful reply as success', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Transaction Successful',
        TxnStatus: EghlTxnStatus.Success,
      }),
    ).toBe('success')
  })

  it('settles a failed reply as failed', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Transaction Failed',
        TxnStatus: EghlTxnStatus.Failed,
      }),
    ).toBe('failed')
  })

  it('settles a buyer cancellation as failed', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({ ...exists, TxnMessage: 'Buyer cancelled', TxnStatus: EghlTxnStatus.Failed }),
    ).toBe('failed')
  })

  it('leaves a pending reply unsettled', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Transaction Pending',
        TxnStatus: EghlTxnStatus.Pending,
      }),
    ).toBeNull()
  })

  it('leaves a duplicate payment id rejection unsettled', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({
        ...exists,
        TxnMessage: 'Duplicate Payment ID',
        TxnStatus: EghlTxnStatus.Failed,
      }),
    ).toBeNull()
  })

  it.each([EghlTxnExists.NotFound, EghlTxnExists.InternalError])(
    'leaves a reply unsettled when TxnExists is %s',
    (TxnExists) => {
      expect.hasAssertions()

      expect(
        finalStatusOf({
          TxnExists,
          TxnMessage: 'Transaction Failed',
          TxnStatus: EghlTxnStatus.Failed,
        }),
      ).toBeNull()
    },
  )

  it.each([
    EghlQueryTxnStatus.NotFound,
    EghlQueryTxnStatus.InternalError,
    EghlQueryTxnStatus.Refunded,
    EghlQueryTxnStatus.Reversed,
  ])('leaves query status %s unsettled', (TxnStatus) => {
    expect.hasAssertions()

    expect(finalStatusOf({ ...exists, TxnMessage: '', TxnStatus })).toBeNull()
  })
})
