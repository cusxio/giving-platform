import { describe, expect, it } from 'vitest'

import { finalStatusOf } from './eghl.finality'
import { EghlQueryTxnStatus, EghlTxnStatus } from './eghl.schema'

describe('eGHL reply finality', () => {
  it('settles a successful reply as success', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({ TxnMessage: 'Transaction Successful', TxnStatus: EghlTxnStatus.Success }),
    ).toBe('success')
  })

  it('settles a failed reply as failed', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({ TxnMessage: 'Transaction Failed', TxnStatus: EghlTxnStatus.Failed }),
    ).toBe('failed')
  })

  it('settles a buyer cancellation as failed', () => {
    expect.hasAssertions()

    expect(finalStatusOf({ TxnMessage: 'Buyer cancelled', TxnStatus: EghlTxnStatus.Failed })).toBe(
      'failed',
    )
  })

  it('leaves a pending reply unsettled', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({ TxnMessage: 'Transaction Pending', TxnStatus: EghlTxnStatus.Pending }),
    ).toBeNull()
  })

  it('leaves a duplicate payment id rejection unsettled', () => {
    expect.hasAssertions()

    expect(
      finalStatusOf({ TxnMessage: 'Duplicate Payment ID', TxnStatus: EghlTxnStatus.Failed }),
    ).toBeNull()
  })

  it.each([
    EghlQueryTxnStatus.NotFound,
    EghlQueryTxnStatus.InternalError,
    EghlQueryTxnStatus.Refunded,
    EghlQueryTxnStatus.Reversed,
  ])('leaves query status %s unsettled', (TxnStatus) => {
    expect.hasAssertions()

    expect(finalStatusOf({ TxnMessage: '', TxnStatus })).toBeNull()
  })
})
