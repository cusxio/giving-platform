import { TaggedError } from 'better-result'

/** A signed-in donor gave an email that another account has. */
export class EmailBelongsToAnotherUser extends TaggedError('EmailBelongsToAnotherUser') {}

/** A guest gave the email of a registered account. */
export class GuestEmailExists extends TaggedError('GuestEmailExists') {}

/** Every fund was given nothing. */
export class InvalidContribution extends TaggedError('InvalidContribution') {}

/** The saved card cannot be charged: no one is signed in (`userId` null), or they never saved it. */
export class PaymentMethodUnavailable extends TaggedError('PaymentMethodUnavailable')<{
  userId: null | number
}> {}

/** No transaction has the id. */
export class ReceiptNotFound extends TaggedError('ReceiptNotFound')<{ transactionId: string }> {}
