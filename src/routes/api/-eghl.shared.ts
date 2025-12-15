import queryString from 'query-string'

import { createParseError } from '#/core/errors'
import { err, ok, tryAsync, trySync } from '#/core/result'
import { EghlPaymentResponseSchema } from '#/features/payment-gateway/eghl.schema'
import { EghlService } from '#/features/payment-gateway/eghl.service'

export async function parseAndVerifyEghlResponse(
  request: Request,
  eghlService: EghlService,
) {
  let raw: string

  if (request.method === 'GET') {
    raw = new URL(request.url).search
  } else if (request.method === 'POST') {
    const bodyResult = await tryAsync(
      () => request.text(),
      () => ({ type: 'SERVER_ERROR' as const }),
    )

    if (!bodyResult.ok) {
      return bodyResult
    }
    raw = bodyResult.value
  } else {
    return err({ type: 'INVALID_METHOD' as const })
  }

  const qsResult = trySync(
    () => queryString.parse(raw),
    () => ({ type: 'SERVER_ERROR' as const }),
  )
  if (!qsResult.ok) return qsResult

  const parseResult = trySync(
    () => EghlPaymentResponseSchema.Parse(qsResult.value),
    createParseError,
  )
  if (!parseResult.ok) return parseResult

  const eghlResponse = parseResult.value

  if (!eghlService.verifyPaymentResponse(eghlResponse)) {
    return err({ type: 'EGHL_VERIFICATION_ERROR' as const })
  }

  return ok(eghlResponse)
}
