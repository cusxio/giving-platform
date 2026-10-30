import type { getCurrentUser } from './account.functions'

/** Derived from the wire, so client code never reads the schema. */
export type CurrentUserResponse = Awaited<ReturnType<typeof getCurrentUser>>

type CurrentUser = Extract<CurrentUserResponse, { type: 'SUCCESS' }>['value']

export type User = CurrentUser['user']
export type UserSettings = CurrentUser['userSettings']
