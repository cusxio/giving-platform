import { describe, expect, it } from 'vitest'

import { createFakeDb } from './fake-db'
import { testDeps } from './test-deps'

const message = { html: '<p>hi</p>', subject: 'Hi', text: 'hi', to: 'donor@give.test' }

describe('test deps', () => {
  it('uses the slices a test passes in', () => {
    expect.hasAssertions()

    const db = createFakeDb()

    expect(testDeps({ db }).db).toBe(db)
  })

  it('refuses to send mail unless the test provides a mailer', async () => {
    expect.hasAssertions()

    await expect(testDeps().mailer.send(message)).rejects.toThrow('testDeps has no mailer')
  })
})
