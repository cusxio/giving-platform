import { Type } from 'typebox'
import { Compile } from 'typebox/compile'
import { describe, expect, it } from 'vitest'

import { parseWith } from './input.server'
import { okValue } from './testing/result'

describe('parsing procedure input', () => {
  it('keeps only the fields the schema declares, at every level', () => {
    expect.hasAssertions()

    const parse = parseWith(
      Compile(
        Type.Object({
          at: Type.Optional(Type.Refine(Type.Unsafe<Date>({}), (value) => value instanceof Date)),
          name: Type.String(),
          nested: Type.Object({ amount: Type.Number() }),
        }),
      ),
    )
    const at = new Date('2026-01-01T00:00:00Z')

    expect(
      okValue(
        parse({ at, name: 'Ada', nested: { amount: 5, role: 'su' }, role: 'su', status: 'x' }),
      ),
    ).toStrictEqual({ at, name: 'Ada', nested: { amount: 5 } })
  })
})
