import { TZDate } from '@date-fns/tz'

export const serverTz = 'UTC'
export const clientTz = 'Asia/Kuala_Lumpur'

export { TZDate } from '@date-fns/tz'

export {
  addDays,
  addMinutes,
  addSeconds,
  addYears,
  differenceInDays,
  differenceInMinutes,
  endOfMonth,
  endOfYear,
  formatDistanceToNow,
  getWeek,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfYear,
} from 'date-fns'

export function now(tz = serverTz) {
  return new TZDate().withTimeZone(tz)
}
