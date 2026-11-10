import { defineQuery, firstOrNull } from '#/server/db.server'
import type { UserSettings } from '#/server/schema.server'
import { userSettings } from '#/server/schema.server'

export type { UserSettings } from '#/server/schema.server'

export const upsertPrivacyMode = defineQuery(
  'account.upsertPrivacyMode',
  (db, userId: UserSettings['userId'], privacyMode: UserSettings['privacyMode']) =>
    db
      .insert(userSettings)
      .values({ privacyMode, userId })
      .onConflictDoUpdate({ set: { privacyMode }, target: userSettings.userId })
      .returning(),
  firstOrNull,
)
