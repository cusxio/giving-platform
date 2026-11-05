import { TaggedError } from 'better-result'

/** Missing, without items, or another donor's. The viewer cannot tell which. */
export class TransactionNotFound extends TaggedError('TransactionNotFound') {}
