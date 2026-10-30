import { tryAsync } from '#/core/result'
import { MAILERSEND_API_KEY, MAILERSEND_ROOT_DOMAIN } from '#/server/env.server'
import { logger } from '#/server/logger.server'
import type { MailMessage } from '#/server/mailer.server'
import { openMailTransport } from '#/server/mailer.server'

export interface SendEmailError {
  readonly error: unknown
  readonly type: 'SendEmailError'
}

export class EmailService {
  async sendEmail(input: MailMessage) {
    const transport = await openMailTransport(
      { apiKey: MAILERSEND_API_KEY, rootDomain: MAILERSEND_ROOT_DOMAIN },
      logger,
    )

    return tryAsync(
      () => transport.send(input),
      (error: unknown): SendEmailError => ({ error, type: 'SendEmailError' }),
    )
  }
}
