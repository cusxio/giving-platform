import type { Result } from 'better-result'

/** The `Ok` value, so a test can assert on it directly. Throws on `Err`, with the error as cause. */
export function okValue<T, E>(result: Result<T, E>): T {
  if (result.isErr()) {
    throw new Error('expected Ok, got Err', { cause: result.error })
  }
  return result.value
}

/** The `Err` error, so a test can assert on it directly. Throws on `Ok`. */
export function errValue<T, E>(result: Result<T, E>): E {
  if (result.isOk()) {
    throw new Error('expected Err, got Ok', { cause: result.value })
  }
  return result.error
}
