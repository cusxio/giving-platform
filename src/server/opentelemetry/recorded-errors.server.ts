const recorded = new WeakSet()

/** Notes that `error` is already on the request span, so the handler that sees it rethrown skips it. */
export function markRecorded(error: unknown) {
  if (typeof error === 'object' && error !== null) {
    recorded.add(error)
  }
}

export const isRecorded = (error: unknown) =>
  typeof error === 'object' && error !== null && recorded.has(error)
