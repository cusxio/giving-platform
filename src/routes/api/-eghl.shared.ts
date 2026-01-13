import queryString from 'query-string'

import { createParseError } from '#/core/errors'
import type { Result } from '#/core/result'
import { err, ok, tryAsync, trySync } from '#/core/result'
import type { EghlCallbackError } from '#/features/payment-gateway/eghl.errors'
import type { EghlPaymentResponse } from '#/features/payment-gateway/eghl.schema'
import { EghlPaymentResponseSchema } from '#/features/payment-gateway/eghl.schema'
import { EghlService } from '#/features/payment-gateway/eghl.service'

export async function parseAndVerifyEghlResponse(
  request: Request,
  eghlService: EghlService,
): Promise<Result<EghlPaymentResponse, EghlCallbackError>> {
  let raw: string

  if (request.method === 'GET') {
    raw = new URL(request.url).search
  } else if (request.method === 'POST') {
    const bodyResult = await tryAsync(
      () => request.text(),
      () => ({ type: 'EghlServerError' }),
    )

    if (!bodyResult.ok) {
      return bodyResult
    }
    raw = bodyResult.value
  } else {
    return err({ type: 'EghlInvalidMethodError' })
  }

  const qsResult = trySync(
    () => queryString.parse(raw),
    () => ({ type: 'EghlServerError' }),
  )
  if (!qsResult.ok) return qsResult

  const parseResult = trySync(
    () => EghlPaymentResponseSchema.Parse(qsResult.value),
    createParseError,
  )
  if (!parseResult.ok) return parseResult

  const eghlResponse = parseResult.value

  if (!eghlService.verifyPaymentResponse(eghlResponse)) {
    return err({ type: 'EghlVerificationError' })
  }

  return ok(eghlResponse)
}
