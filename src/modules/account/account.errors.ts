import { TaggedError } from 'better-result'

/** The session is valid but its account row is gone. */
export class AccountNotFound extends TaggedError('AccountNotFound')<{ userId: number }> {}
