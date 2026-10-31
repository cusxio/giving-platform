import { EmailParams, MailerSend, Recipient, Sender } from 'mailersend'
import { createTestAccount, createTransport, getTestMessageUrl } from 'nodemailer'
import type { Logger } from 'pino'

import { config } from '#/core/brand'

export interface MailConfig {
  /** Without a key, mail goes to a throwaway Ethereal inbox and the log carries its URL. */
  readonly apiKey: string | undefined
  readonly rootDomain: string | undefined
}

export interface MailMessage {
  readonly html: string
  readonly subject: string
  readonly text: string
  readonly to: string
}

export interface Mailer {
  readonly send: (message: MailMessage) => Promise<void>
}

export function createMailer(mailConfig: MailConfig, logger: Logger): Mailer {
  return {
    send: async (message) => {
      const transport = await openMailTransport(mailConfig, logger)
      await transport.send(message)
    },
  }
}

async function openMailTransport(mailConfig: MailConfig, logger: Logger): Promise<Mailer> {
  return mailConfig.apiKey === undefined
    ? openTestTransport(logger)
    : openMailerSendTransport(mailConfig.apiKey, mailConfig.rootDomain)
}

function openMailerSendTransport(apiKey: string, rootDomain: string | undefined): Mailer {
  const mailerSend = new MailerSend({ apiKey })
  const systemEmail = rootDomain === undefined ? config.email.system : `system@${rootDomain}`
  const replyEmail = rootDomain === undefined ? config.email.finance : `finance@${rootDomain}`

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
