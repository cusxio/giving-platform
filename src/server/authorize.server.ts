import { Result, TaggedError } from 'better-result'

import type { RequestContext } from '#/server/request-context.server'

export type SessionUser = NonNullable<RequestContext['user']>
type SignedIn = RequestContext & { readonly user: SessionUser }
type Anonymous = RequestContext & { readonly user: null }

/** No session. How it reaches the client is the procedure kind's decision. */
export class SignedOut extends TaggedError('SignedOut') {}
/** Signed in without the role. A read answers `notFound()`, so the page hides that it exists. */
export class Forbidden extends TaggedError('Forbidden') {}
/** A login or signup call from a signed-in browser. Answered with a redirect home. */
class AlreadySignedIn extends TaggedError('AlreadySignedIn')<{ userId: number }> {}

export type Refusal = AlreadySignedIn | Forbidden | SignedOut

/** Narrows the context a workflow receives, or says why the call may not run. */
export type Policy<C, E extends Refusal> = (context: RequestContext) => Result<C, E>

export const anyone: Policy<RequestContext, never> = (context) => Result.ok(context)

export const anonymousOnly: Policy<Anonymous, AlreadySignedIn> = (context) =>
  context.user === null
    ? Result.ok({ ...context, user: null })
    : Result.err(new AlreadySignedIn({ userId: context.user.id }))

export const requireUser: Policy<SignedIn, SignedOut> = (context) =>
  context.user === null
    ? Result.err(new SignedOut())
    : Result.ok({ ...context, user: context.user })

/** Signed in as a super user. Anyone else is refused, so an su-only read stays hidden. */
export const requireSu: Policy<
  SignedIn & { readonly user: { readonly role: 'su' } },
  Forbidden | SignedOut
> = (context) => {
  const { user } = context
  if (user === null) {
    return Result.err(new SignedOut())
  }
  return user.role === 'su'
    ? Result.ok({ ...context, user: { ...user, role: user.role } })
    : Result.err(new Forbidden())
}
