import { describe, expect, it, vi } from 'vitest'

import { maintenanceMiddleware } from './maintenance.server'

function answer(path: string) {
  const { server } = maintenanceMiddleware.options
  if (server === undefined) {
    throw new TypeError('maintenanceMiddleware has no server function')
  }
  return server({
    context: undefined,
    handlerType: 'serverFn',
    next: () => {
      throw new Error('passed through')
    },
    pathname: path,
    request: new Request(`https://app.give.test${path}`),
  })
}

describe('maintenance mode', () => {
  it('answers a server function call with a full page load of /', async () => {
    expect.hasAssertions()

    vi.stubEnv('MAINTENANCE_MODE', 'true')
    try {
      await expect(answer('/_serverFn/abc')).rejects.toMatchObject({
        options: { reloadDocument: true, to: '/' },
      })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
