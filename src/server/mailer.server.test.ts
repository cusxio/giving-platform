import { pino } from 'pino'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

import type { MailConfig } from './mailer.server'
import { createMailer } from './mailer.server'

const silent = pino({ level: 'silent' })

const message = {
  html: '<p>Your code is 123456</p>',
  subject: 'Your login code',
  text: 'Your code is 123456',
  to: 'donor@give.test',
}

function stubFetch(respond: (request: Request) => Promise<Response>) {
  const requests: Request[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return respond(request)
    }),
  )
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  return requests
}

const brevo: MailConfig = { apiKey: 'brevo-key', provider: 'brevo', rootDomain: 'demo.test' }

describe('the Brevo mailer', () => {
  it('posts the email to the transactional email endpoint', async () => {
    expect.hasAssertions()

    const requests = stubFetch(() =>
      Promise.resolve(Response.json({ messageId: '<1@relay.brevo.test>' }, { status: 201 })),
    )

    await createMailer(brevo, silent).send(message)

    expect(requests).toHaveLength(1)
    const [request] = requests
    expect({
      apiKey: request?.headers.get('api-key'),
      contentType: request?.headers.get('content-type'),
      method: request?.method,
      url: request?.url,
    }).toStrictEqual({
      apiKey: 'brevo-key',
      contentType: 'application/json',
      method: 'POST',
      url: 'https://api.brevo.com/v3/smtp/email',
    })
    await expect(request?.json()).resolves.toStrictEqual({
      htmlContent: '<p>Your code is 123456</p>',
      replyTo: { email: 'finance@demo.test', name: 'Collective' },
      sender: { email: 'system@demo.test', name: 'Collective' },
      subject: 'Your login code',
      textContent: 'Your code is 123456',
      to: [{ email: 'donor@give.test' }],
    })
  })

  it('sends from the brand addresses without a root domain', async () => {
    expect.hasAssertions()

    const requests = stubFetch(() => Promise.resolve(new Response(null, { status: 201 })))

    await createMailer({ ...brevo, rootDomain: undefined }, silent).send(message)

    await expect(requests[0]?.json()).resolves.toMatchObject({
      replyTo: { email: 'finance@collective.my' },
      sender: { email: 'system@collective.my' },
    })
  })

  it('fails a send that Brevo refuses, naming the status but not the key or the body', async () => {
    expect.hasAssertions()

    stubFetch(() =>
      Promise.resolve(
        Response.json({ code: 'unauthorized', message: 'Key not found' }, { status: 401 }),
      ),
    )

    const sent = createMailer(brevo, silent).send(message)

    await expect(sent).rejects.toThrow('401')
    await expect(sent).rejects.not.toThrow(/brevo-key|123456|Key not found/u)
  })

  it('fails a send that Brevo never answers once the timeout passes', async () => {
    expect.hasAssertions()

    stubFetch(
      (request) =>
        new Promise((_resolve, reject) => {
          request.signal.addEventListener('abort', () => {
            reject(request.signal.reason as Error)
          })
        }),
    )

    await expect(
      createMailer(brevo, silent, { brevoTimeoutMs: 5 }).send(message),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
  })
})

describe('the MailerSend mailer', () => {
  it('sends through MailerSend from the root domain', async () => {
    expect.hasAssertions()

    const requests = stubFetch(() => Promise.resolve(new Response(null, { status: 202 })))

    await createMailer(
      { apiKey: 'mailersend-key', provider: 'mailersend', rootDomain: 'demo.test' },
      silent,
    ).send(message)

    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request?.url).toBe('https://api.mailersend.com/v1/email')
    expect(request?.headers.get('authorization')).toBe('Bearer mailersend-key')
    await expect(request?.json()).resolves.toMatchObject({
      from: { email: 'system@demo.test', name: 'Collective' },
      html: '<p>Your code is 123456</p>',
      reply_to: { email: 'finance@demo.test', name: 'Collective' },
      subject: 'Your login code',
      text: 'Your code is 123456',
      to: [{ email: 'donor@give.test' }],
    })
  })
})
