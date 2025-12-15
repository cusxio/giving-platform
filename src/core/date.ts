import { TZDate, tzOffset } from '@date-fns/tz'

export const serverTz = 'UTC'
export const clientTz = 'Asia/Kuala_Lumpur'

export { TZDate } from '@date-fns/tz'

export {
  addDays,
  addMinutes,
  addSeconds,
  addYears,
  differenceInDays,
  endOfMonth,
  endOfYear,
  format,
  formatDistanceToNow,
  getWeek,
  startOfDay,
  startOfMonth,
  startOfYear,
} from 'date-fns'

export function getTzOffsetModifier() {
  const offset = tzOffset(clientTz, now())
  return `${offset} minutes`
}

export function now(tz = serverTz) {
  return new TZDate().withTimeZone(tz)
}
