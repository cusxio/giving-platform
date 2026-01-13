export interface Err<E> {
  readonly error: E
  readonly ok: false
}

export interface Ok<T> {
  readonly ok: true
  readonly value: T
}

export type Result<T, E> = Err<E> | Ok<T>

export function ok(): Ok<void>
export function ok<T>(value: T): Ok<T>
export function ok<T>(value?: T): Ok<T> {
  return { ok: true, value: value as T }
}

export const err = <E>(error: E): Err<E> => ({ ok: false, error })

export const getOrThrow = <T, E>(result: Result<T, E>): T => {
  if (result.ok) {
    return result.value
  } else {
    throw new Error('getOrThrow failed', { cause: result.error })
  }
}

export const trySync = <T, const E>(
  fn: () => T,
  mapError: (error: unknown) => E,
): Result<T, E> => {
  try {
    return ok(fn())
  } catch (error) {
    return err(mapError(error))
  }
}

export const tryAsync = async <T, const E>(
  promiseFn: () => Promise<T>,
  mapError: (error: unknown) => E,
): Promise<Result<T, E>> =>
  promiseFn().then(
    (value) => ok(value),
    (error: unknown) => err(mapError(error)),
  )
