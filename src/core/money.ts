const CENTS_IN_RINGGIT = 100

export function centsToRinggit(amountInCents: number): number {
  return amountInCents / CENTS_IN_RINGGIT
}

export function ringgitToCents(amount: number): number {
  return Math.round(amount * CENTS_IN_RINGGIT)
}
