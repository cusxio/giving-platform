import { sha256 } from '@oslojs/crypto/sha2'
import { encodeHexLowerCase } from '@oslojs/encoding'
import { describe, expect, it, vi } from 'vitest'

import { EghlTxnStatus } from './eghl.schema'
import type { EghlPaymentResponse } from './eghl.schema'

const mockedEnv = vi.hoisted(() => ({
  BASE_URL: 'https://app.give.test',
  EGHL_PASSWORD: 'secret-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
}))

vi.mock('#/envvars', () => mockedEnv)

const { EghlService } = await import('./eghl.service')

const hashValue = (value: string) => {
  const data = new TextEncoder().encode(value)
  const hash = sha256(data)
  return encodeHexLowerCase(hash)
}

const createService = () => new EghlService()

const buildResponse = (
  overrides: Partial<EghlPaymentResponse> = {},
): EghlPaymentResponse => {
  const base: EghlPaymentResponse = {
    TransactionType: 'SALE',
    PymtMethod: 'ANY',
    ServiceID: mockedEnv.EGHL_SERVICE_ID,
    PaymentID: 'txn_abc123',
    OrderNumber: 'txn_abc123',
    Amount: '50.00',
    CurrencyCode: 'MYR',
    HashValue: 'unused',
    HashValue2: '',
    TxnID: 'CIVtxn_abc123',
    TxnStatus: EghlTxnStatus.Success,
    TxnMessage: 'Transaction Successful',
    AuthCode: 'AUTH123',
    Param6: '',
    Param7: '',
  }

  const response = { ...base, ...overrides }

  const signature =
    overrides.HashValue2 ??
    hashValue(
      [
        mockedEnv.EGHL_PASSWORD,
        response.TxnID,
        response.ServiceID,
        response.PaymentID,
        response.TxnStatus,
        response.Amount,
        response.CurrencyCode,
        response.AuthCode,
        response.OrderNumber,
        response.Param6,
        response.Param7,
      ].join(''),
    )

  return { ...response, HashValue2: signature }
}

describe('EghlService', () => {
  describe('createPaymentRequestURL', () => {
    it('builds a signed payment request that eGHL accepts', () => {
      const service = createService()

      const url = service.createPaymentRequestURL({
        amountInCents: 9950,
        customerEmail: 'jane@example.com',
        customerName: 'Jane Doe',
        description: 'Giving',
        transactionId: 'txn_001',
      })

      const parsed = new URL(url)
      expect(`${parsed.origin}${parsed.pathname}`).toBe(mockedEnv.EGHL_URL)

      const params = parsed.searchParams
      const expectedReturnURL = `${mockedEnv.BASE_URL}/api/eghl/return`
      const expectedCallbackURL = `${mockedEnv.BASE_URL}/api/eghl/callback`

      expect(params.get('ServiceID')).toBe(mockedEnv.EGHL_SERVICE_ID)
      expect(params.get('PaymentID')).toBe('txn_001')
      expect(params.get('OrderNumber')).toBe('txn_001')
      expect(params.get('Amount')).toBe('99.50')
      expect(params.get('CurrencyCode')).toBe('MYR')
      expect(params.get('CustName')).toBe('Jane Doe')
      expect(params.get('CustEmail')).toBe('jane@example.com')
      expect(params.get('MerchantReturnURL')).toBe(expectedReturnURL)
      expect(params.get('MerchantCallBackURL')).toBe(expectedCallbackURL)

      const expectedHash = hashValue(
        [
          mockedEnv.EGHL_PASSWORD,
          mockedEnv.EGHL_SERVICE_ID,
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
          '',
          '',
        ].join(''),
      )

      expect(params.get('HashValue')).toBe(expectedHash)
    })
  })

  describe('verifyPaymentResponse', () => {
    it('returns true when the response is signed by eGHL', () => {
      const service = createService()
      const response = buildResponse()

      expect(service.verifyPaymentResponse(response)).toBe(true)
    })

    it('returns false when the signature is missing', () => {
      const service = createService()
      const response = buildResponse({ HashValue2: '' })

      expect(service.verifyPaymentResponse(response)).toBe(false)
    })

    it('returns false when the signature does not match', () => {
      const service = createService()
      const response = buildResponse({ HashValue2: 'not-valid' })

      expect(service.verifyPaymentResponse(response)).toBe(false)
    })
  })
})
