/* oxlint-disable vitest/no-hooks, vitest/no-importing-vitest-globals, vitest/require-top-level-describe */
import { afterAll, afterEach, beforeAll } from 'vitest'

import { server } from '../mocks/server' // We will create this next

// Establish API mocking before all tests.
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

// Reset any request handlers that we may add during the tests,
// So they don't affect other tests.
afterEach(() => {
  server.resetHandlers()
})

// Clean up after the tests are finished.
afterAll(() => {
  server.close()
})
