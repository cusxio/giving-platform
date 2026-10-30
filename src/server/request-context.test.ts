import { Writable } from 'node:stream'

import type { getGlobalStartContext } from '@tanstack/react-start'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import { addDays, now } from '#/core/date'
import type { SessionRepository } from '#/features/session/session.repository'
import type * as Envvars from '#/server/env.server'
import type { User } from '#/server/schema.server'

import type { Deps } from './deps.server'
import type { RequestContext } from './request-context.server'

const io = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  dbDown: false,
  logs: [] as Record<string, unknown>[],
  setCookies: [] as string[],
  store: new Map<
    string,
    {
      session: { expiresAt: Date; id: string; tokenHash: string }
      user: { id: number; journey: 'start_fresh'; role: 'user'; status: string }
    }
  >(),
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

vi.mock(import('@tanstack/react-start/server'), () => ({
  getCookie: () => io.cookie,
  setResponseHeader: (name, value) => {
    if (name === 'Set-Cookie') {
      io.setCookies.push(...[value].flat())
    }
  },
}))

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

vi.mock(import('#/features/session/session.repository'), async () => {
  const result = await import('#/core/result')
  const dbError = result.err({ error: new Error('db down'), type: 'DBQueryError' as const })
  const FakeSessionRepository = class {
    deleteSessionById(id: string) {
      io.store.delete(id)
      return Promise.resolve(result.ok())
    }
    extendSession(id: string, expiresAt: Date) {
      const row = io.store.get(id)
      if (row) {
        row.session.expiresAt = expiresAt
      }
      return Promise.resolve(result.ok(row?.session ?? null))
    }
    findSessionByIdWithUser(id: string) {
      if (io.dbDown) {
        return Promise.resolve(dbError)
      }
      const row = io.store.get(id)
      return Promise.resolve(
        result.ok(row ? { session: { ...row.session }, user: { ...row.user } } : null),
      )
    }
  }
  return { SessionRepository: FakeSessionRepository as unknown as typeof SessionRepository }
})

const { hashToken } = await import('./crypto.server')
const { requestContext } = await import('./request-context.server')

const SESSION_ID = 'session'.padEnd(21, '0')
const RAW_TOKEN = 'token'.padEnd(21, '0')
const COOKIE = `${SESSION_ID}.${RAW_TOKEN}`

function seed(status: User['status'], expiresInDays: number) {
  io.store.set(SESSION_ID, {
    session: {
      expiresAt: addDays(now(), expiresInDays),
      id: SESSION_ID,
      tokenHash: hashToken(RAW_TOKEN),
    },
    user: { id: 42, journey: 'start_fresh', role: 'user', status },
  })
}

async function handle(cookie?: string) {
  io.cookie = cookie
  io.setCookies = []
  io.logs = []
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
  return { context, logs: io.logs, setCookies: io.setCookies }
}

const cleared = (cookie: string | undefined) =>
  cookie?.startsWith('__session=;') === true && cookie.includes('Expires=Thu, 01 Jan 1970')

describe('the request context middleware', () => {
  it('treats a request without a cookie as anonymous and leaves cookies alone', async () => {
    expect.hasAssertions()

    const { context, setCookies } = await handle()

    expect(context).toMatchObject({ session: null, user: null })
    expect(setCookies).toStrictEqual([])
  })

  it('passes a valid session through without touching the cookie', async () => {
    expect.hasAssertions()

    seed('active', 20)
    const { context, setCookies } = await handle(COOKIE)

    expect(context.user).toMatchObject({ id: 42, journey: 'start_fresh', role: 'user' })
    expect(context.session).toMatchObject({ id: SESSION_ID, tokenHash: hashToken(RAW_TOKEN) })
    expect(setCookies).toStrictEqual([])
  })

  it('extends a session within a week of expiry and sends the refreshed cookie', async () => {
    expect.hasAssertions()

    seed('active', 3)
    const { context, setCookies } = await handle(COOKIE)

    expect(setCookies).toHaveLength(1)
    expect(setCookies[0]).toMatch(new RegExp(`^__session=${COOKIE};`, 'u'))
    expect(context.session?.expiresAt.getTime()).toBeGreaterThan(addDays(now(), 29).getTime())
  })

  it('rejects the session of a suspended user, deletes it and clears the cookie', async () => {
    expect.hasAssertions()

    seed('suspended', 20)
    const { context, logs, setCookies } = await handle(COOKIE)

    expect(context).toMatchObject({ session: null, user: null })
    expect(io.store.has(SESSION_ID)).toBe(false)
    expect(setCookies).toHaveLength(1)
    expect(cleared(setCookies[0])).toBe(true)
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: 'session.verify.invalid',
        reason: 'SessionUserInactiveError',
      }),
    )
  })

  it.each([
    ['malformed', 'not-a-session', 'session.verify.validation_failed'],
    ['unreadable from the db', COOKIE, 'session.verify.db_error'],
  ])('clears a cookie that is %s', async (_label, cookie, event) => {
    expect.hasAssertions()

    seed('active', 20)
    io.dbDown = event === 'session.verify.db_error'
    const { context, logs, setCookies } = await handle(cookie)
    io.dbDown = false

    expect(context).toMatchObject({ session: null, user: null })
    expect(cleared(setCookies[0])).toBe(true)
    expect(logs).toContainEqual(expect.objectContaining({ event }))
  })

  it('scopes the logger to the signed-in user and hands it out on both keys', async () => {
    expect.hasAssertions()

    seed('active', 20)
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
    expect(context.deps.hashToken(RAW_TOKEN)).toBe(hashToken(RAW_TOKEN))
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
