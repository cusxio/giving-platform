import { eq } from 'drizzle-orm'

import { defineQuery, firstOrNull } from '#/server/db.server'
import type { UserSettings } from '#/server/schema.server'
import { userSettings } from '#/server/schema.server'

export type { UserSettings } from '#/server/schema.server'

export const findSettingsByUserId = defineQuery(
  'account.findSettingsByUserId',
  (db, userId: UserSettings['userId']) =>
    db.select().from(userSettings).where(eq(userSettings.userId, userId)),
  firstOrNull,
)
