import type { Logger } from 'pino'

import { assertExhaustive } from '#/core/assert-exhaustive'
import { config } from '#/core/brand'

type MailProvider =
  | { readonly apiKey: string; readonly provider: 'brevo' | 'mailersend' }
  | { readonly provider: 'test' }

export type MailConfig = MailProvider & { readonly rootDomain: string | undefined }

export interface MailMessage {
  readonly html: string
  readonly subject: string
  readonly text: string
  readonly to: string
}

export interface Mailer {
  readonly send: (message: MailMessage) => Promise<void>
}

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email'
const BREVO_TIMEOUT_MS = 10_000

export function createMailer(
  mailConfig: MailConfig,
  logger: Logger,
  { brevoTimeoutMs = BREVO_TIMEOUT_MS }: { readonly brevoTimeoutMs?: number } = {},
): Mailer {
  return {
    send: async (message) => {
      const transport = await openMailTransport(mailConfig, logger, brevoTimeoutMs)
      await transport.send(message)
    },
  }
}

async function openMailTransport(
  mailConfig: MailConfig,
  logger: Logger,
  brevoTimeoutMs: number,
): Promise<Mailer> {
  switch (mailConfig.provider) {
    case 'brevo': {
      return brevoTransport(mailConfig.apiKey, mailConfig.rootDomain, brevoTimeoutMs)
    }
    case 'mailersend': {
      return openMailerSendTransport(mailConfig.apiKey, mailConfig.rootDomain)
    }
    case 'test': {
      return openTestTransport(logger)
    }
    default: {
      return assertExhaustive(mailConfig)
    }
  }
}

function senderAddresses(rootDomain: string | undefined) {
  return rootDomain === undefined
    ? { replyEmail: config.email.finance, systemEmail: config.email.system }
    : { replyEmail: `finance@${rootDomain}`, systemEmail: `system@${rootDomain}` }
}

function brevoTransport(
  apiKey: string,
  rootDomain: string | undefined,
  brevoTimeoutMs: number,
): Mailer {
  const { replyEmail, systemEmail } = senderAddresses(rootDomain)

  return {
    send: async ({ to, subject, html, text }) => {
      const response = await fetch(BREVO_SEND_URL, {
        body: JSON.stringify({
          htmlContent: html,
          replyTo: { email: replyEmail, name: config.name },
          sender: { email: systemEmail, name: config.name },
          subject,
          textContent: text,
          to: [{ email: to }],
        }),
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        method: 'POST',
        signal: AbortSignal.timeout(brevoTimeoutMs),
      })
      await response.body?.cancel()
      if (!response.ok) {
        throw new Error(`Brevo refused the email with HTTP ${response.status}`)
      }
    },
  }
}

async function openMailerSendTransport(
  apiKey: string,
  rootDomain: string | undefined,
): Promise<Mailer> {
  const { EmailParams, MailerSend, Recipient, Sender } = await import('mailersend')
  const mailerSend = new MailerSend({ apiKey })
  const { replyEmail, systemEmail } = senderAddresses(rootDomain)

  return {
    send: async ({ to, subject, html, text }) => {
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

async function openTestTransport(logger: Logger): Promise<Mailer> {
  const { createTestAccount, createTransport, getTestMessageUrl } = await import('nodemailer')
  const testAccount = await createTestAccount()

  const transporter = createTransport({
    auth: { pass: testAccount.pass, user: testAccount.user },
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
  })

  return {
    send: async ({ to, subject, html, text }) => {
      const info = await transporter.sendMail({
        from: `${config.name} <${config.email.system}>`,
        html,
        subject,
        text,
        to,
      })

      logger.info(
        { event: 'email.sent.test_mode', to, url: getTestMessageUrl(info) },
        'Test email sent (View URL in attributes)',
      )
    },
  }
}
