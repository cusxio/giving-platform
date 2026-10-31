import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { createEghlClient } from './eghl.gateway.server'

const config = {
  baseUrl: 'https://app.give.test',
  password: 'secret-password',
  serviceId: 'service-123',
  url: 'https://eghl.test/pay',
}

const hashValue = (value: string) => createHash('sha256').update(value).digest('hex')

const expectedReturnURL = `${config.baseUrl}/api/eghl/return`
const expectedCallbackURL = `${config.baseUrl}/api/eghl/callback`

const signedFields = (token: string) =>
  [
    config.password,
    config.serviceId,
    'txn_001',
    expectedReturnURL,
    '',
    '',
    expectedCallbackURL,
    '99.50',
    'MYR',
    '',
    '',
    '',
    token,
    '',
  ].join('')

const request = {
  amountInCents: 9950,
  customerEmail: 'jane@example.com',
  customerName: 'Jane Doe',
  description: 'Giving',
  transactionId: 'txn_001',
}

describe('the eGHL client', () => {
  it('builds a signed payment request that eGHL accepts', () => {
    expect.hasAssertions()

    const url = createEghlClient(config).paymentRequestUrl(request)

    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe(config.url)

    const params = parsed.searchParams
    expect(Object.fromEntries(params)).toMatchObject({
      Amount: '99.50',
      CurrencyCode: 'MYR',
      CustEmail: 'jane@example.com',
      CustName: 'Jane Doe',
      MerchantCallBackURL: expectedCallbackURL,
      MerchantReturnURL: expectedReturnURL,
      OrderNumber: 'txn_001',
      PaymentID: 'txn_001',
      ServiceID: config.serviceId,
    })
    expect(params.has('Token')).toBe(false)
    expect(params.get('HashValue')).toBe(hashValue(signedFields('')))
  })

  it('charges a saved card by its token, signing the token too', () => {
    expect.hasAssertions()

    const url = createEghlClient(config).paymentRequestUrl({ ...request, token: 'tok_visa' })

    const params = new URL(url).searchParams
    expect(params.get('Token')).toBe('tok_visa')
    expect(params.get('TokenType')).toBe('OCP')
    expect(params.get('HashValue')).toBe(hashValue(signedFields('tok_visa')))
  })
})
