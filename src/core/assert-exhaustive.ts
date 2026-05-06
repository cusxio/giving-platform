export function assertExhaustive(x: never): never {
  // oxlint-disable-next-line typescript/restrict-template-expressions
  throw new Error(`Unhandled case: ${x}`)
}
