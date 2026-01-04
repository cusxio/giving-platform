import { EmailParams, MailerSend, Recipient, Sender } from 'mailersend'
import {
  createTestAccount,
  createTransport,
  getTestMessageUrl,
} from 'nodemailer'

import { config } from '#/core/brand'
import { logger } from '#/core/logger'
import { tryAsync } from '#/core/result'
import { MAILERSEND_API_KEY, MAILERSEND_ROOT_DOMAIN } from '#/envvars'

export interface SendEmailError {
  readonly error: unknown
  readonly type: 'SendEmailError'
}

interface SendEmailInput {
  html: string
  subject: string
  text: string
  to: string
}

export class EmailService {
  async sendEmail(input: SendEmailInput) {
    const client =
      MAILERSEND_API_KEY === undefined
        ? await this.#createTestClient()
        : this.#createClient()

    const result = await tryAsync(
      () => client.sendEmail(input),
      (error: unknown): SendEmailError => ({ type: 'SendEmailError', error }),
    )

    return result
  }

  #createClient() {
    if (MAILERSEND_API_KEY === undefined) {
      throw new TypeError('Missing MAILERSEND_API_KEY')
    }

    const mailerSend = new MailerSend({ apiKey: MAILERSEND_API_KEY })
    const systemEmail =
      MAILERSEND_ROOT_DOMAIN === undefined
        ? config.email.system
        : `system@${MAILERSEND_ROOT_DOMAIN}`
    const replyEmail =
      MAILERSEND_ROOT_DOMAIN === undefined
        ? config.email.finance
        : `finance@${MAILERSEND_ROOT_DOMAIN}`

    return {
      sendEmail: async ({ to, subject, html, text }: SendEmailInput) => {
        const emailParameters = new EmailParams()
          .setFrom(new Sender(systemEmail, config.name))
          .setTo([new Recipient(to)])
          .setReplyTo(new Sender(replyEmail, config.name))
          .setSubject(subject)
          .setHtml(html)
          .setText(text)

        await mailerSend.email.send(emailParameters)
      },
    }
  }

  async #createTestClient() {
    const testAccount = await createTestAccount()

    const transporter = createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    })

    return {
      sendEmail: async ({ to, subject, html, text }: SendEmailInput) => {
        const info = await transporter.sendMail({
          from: `${config.name} <${config.email.system}>`,
          to,
          subject,
          html,
          text,
        })

        logger.info(
          { event: 'email.sent.test_mode', url: getTestMessageUrl(info), to },
          'Test email sent (View URL in attributes)',
        )
      },
    }
  }
}
