import { Writable } from 'node:stream'

import type { getGlobalStartContext } from '@tanstack/react-start'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { addDays, now } from '#/core/date'
import type * as AuthServer from '#/modules/auth/server'
import type * as Envvars from '#/server/env.server'

import { createTokenHasher } from './crypto.server'
import type { Deps } from './deps.server'
import type { RequestContext } from './request-context.server'

const io = vi.hoisted(() => ({
  check: { session: null, user: null } as AuthServer.SessionCheck,
  cookie: undefined as string | undefined,
  logs: [] as Record<string, unknown>[],
  verified: [] as { cookie: string; logger: unknown }[],
}))

vi.mock<typeof Envvars>(import('#/server/env.server'), () => ({
  BASE_URL: 'https://app.give.test',
  CRON_SECRET: undefined,
  DATABASE_URL: 'postgres://user:pass@db.give.test/db',
  EGHL_PASSWORD: 'secret-password',
  EGHL_SERVICE_ID: 'service-123',
  EGHL_URL: 'https://eghl.test/pay',
  MAILERSEND_API_KEY: undefined,
  MAILERSEND_ROOT_DOMAIN: undefined,
  SESSION_SECRET: 'test-session-secret',
}))

vi.mock(import('@tanstack/react-start/server'), () => ({ getCookie: () => io.cookie }))

vi.mock(import('#/server/logger.server'), async () => {
  const { pino: createLogger } = await import('pino')
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      io.logs.push(JSON.parse(chunk.toString()) as Record<string, unknown>)
      done()
    },
  })
  return { logger: createLogger(sink) }
})

vi.mock<typeof AuthServer>(import('#/modules/auth/server'), async (importOriginal) => ({
  ...(await importOriginal()),
  verifySessionCookie: (deps, cookie) => {
    io.verified.push({ cookie, logger: deps.logger })
    return Promise.resolve(io.check)
  },
}))

const { logger: rootLogger } = await import('./logger.server')
const { requestContext } = await import('./request-context.server')

const COOKIE = `${'session'.padEnd(21, '0')}.${'token'.padEnd(21, '0')}`
const SIGNED_IN: AuthServer.SessionCheck = {
  session: { expiresAt: addDays(now(), 20), id: 'session'.padEnd(21, '0'), tokenHash: 'hash' },
  user: { id: 42, journey: 'start_fresh', role: 'user' },
}

async function handle(cookie?: string) {
  io.cookie = cookie
  io.logs = []
  io.verified = []
  const { server } = requestContext.options
  if (server === undefined) {
    throw new TypeError('requestContext has no server function')
  }
  let context: RequestContext | undefined
  await server({
    context: {},
    handlerType: 'router',
    next: (options?: { context?: RequestContext }) => {
      context = options?.context
      return {
        context,
        pathname: '/',
        request: new Request('https://app.give.test/'),
        response: new Response(),
      }
    },
    pathname: '/',
    request: new Request('https://app.give.test/'),
  } as never)
  if (context === undefined) {
    throw new TypeError('requestContext did not call next with a context')
  }
  return { context, logs: io.logs, verified: io.verified }
}

describe('the request context middleware', () => {
  it('treats a request without a cookie as anonymous without verifying anything', async () => {
    expect.hasAssertions()

    io.check = SIGNED_IN
    const { context, verified } = await handle()

    expect(context).toMatchObject({ session: null, user: null })
    expect(verified).toStrictEqual([])
  })

  it('verifies the session cookie with the root logger and passes the result through', async () => {
    expect.hasAssertions()

    io.check = SIGNED_IN
    const { context, verified } = await handle(COOKIE)

    expect(verified).toHaveLength(1)
    expect(verified[0]?.cookie).toBe(COOKIE)
    expect(verified[0]?.logger).toBe(rootLogger)
    expect(context).toMatchObject(SIGNED_IN)
  })

  it('leaves a rejected cookie anonymous', async () => {
    expect.hasAssertions()

    io.check = { session: null, user: null }
    const { context } = await handle(COOKIE)

    expect(context).toMatchObject({ session: null, user: null })
  })

  it('scopes the logger to the signed-in user and hands it out on both keys', async () => {
    expect.hasAssertions()

    io.check = SIGNED_IN
    const { context } = await handle(COOKIE)
    io.logs = []
    context.deps.logger.info({ event: 'probe' }, 'probe')

    expect(context.logger).toBe(context.deps.logger)
    expect(io.logs).toContainEqual(expect.objectContaining({ event: 'probe', user_id: 42 }))
  })

  it('builds deps from the composition root', async () => {
    expect.hasAssertions()

    const { context } = await handle()

    expect(context.deps.config).toStrictEqual({
      cronSecret: undefined,
      eghl: {
        baseUrl: 'https://app.give.test',
        password: 'secret-password',
        serviceId: 'service-123',
        url: 'https://eghl.test/pay',
      },
      mail: { apiKey: undefined, rootDomain: undefined },
    })
    expect(context.deps.hashToken('raw')).toBe(createTokenHasher('test-session-secret')('raw'))
  })

  it('types context.deps on every handler through Register', () => {
    expect.hasAssertions()

    type GlobalContext = NonNullable<ReturnType<typeof getGlobalStartContext>>
    expectTypeOf<GlobalContext['deps']>().not.toBeAny()
    expectTypeOf<GlobalContext['deps']>().toEqualTypeOf<Deps>()
    expectTypeOf<GlobalContext['user']>().toEqualTypeOf<RequestContext['user']>()

    expect(requestContext.options.server).toBeTypeOf('function')
  })
})
