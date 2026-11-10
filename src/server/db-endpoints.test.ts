import { describe, expect, it } from 'vitest'

import { sqlEndpoint, websocketProxy } from './db-endpoints'

const PLANETSCALE = 'aws-ap-southeast-1-1.pg.psdb.cloud'
const NEON = 'ep-quiet-sky-a1b2c3d4.ap-southeast-1.aws.neon.tech'
const NEON_POOLER = 'ep-quiet-sky-a1b2c3d4-pooler.ap-southeast-1.aws.neon.tech'
const LOCAL = 'db.localtest.me'

describe('the database endpoints', () => {
  it.each([
    ['PlanetScale, at its own host', PLANETSCALE, `https://${PLANETSCALE}/sql`],
    [
      "Neon, at the driver's regional API host",
      NEON,
      'https://api.ap-southeast-1.aws.neon.tech/sql',
    ],
    [
      "Neon's pooler, at the driver's regional API host",
      NEON_POOLER,
      'https://api.ap-southeast-1.aws.neon.tech/sql',
    ],
    ['the local proxy', LOCAL, 'http://db.localtest.me:4444/sql'],
  ])('send HTTP queries for %s', (_name, host, endpoint) => {
    expect.hasAssertions()

    expect(sqlEndpoint(host)).toBe(endpoint)
  })

  it.each([
    [
      'PlanetScale, naming the address',
      PLANETSCALE,
      `${PLANETSCALE}/v2?address=${PLANETSCALE}:5432`,
    ],
    ["Neon, at the driver's default", NEON, `${NEON}/v2`],
    ["Neon's pooler, at the driver's default", NEON_POOLER, `${NEON_POOLER}/v2`],
    ['the local proxy', LOCAL, 'db.localtest.me:4444/v1'],
  ])('open websockets for %s', (_name, host, proxy) => {
    expect.hasAssertions()

    expect(websocketProxy(host, 5432)).toBe(proxy)
  })
})
