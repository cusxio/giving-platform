import type { Logger } from 'pino'
import { pino } from 'pino'

/** One parsed pino line. Only the fields tests read are typed. */
export interface LogLine {
  readonly [field: string]: unknown
  readonly err?: { readonly message: string; readonly type: string }
  readonly error_type?: string
  readonly event?: string
  readonly level: number
  readonly reason?: string
}

/** A debug-level logger that keeps every line it writes, in order. */
export function recordingLogger(): { events: LogLine[]; logger: Logger } {
  const events: LogLine[] = []
  const logger = pino(
    { level: 'debug' },
    {
      write: (line: string) => {
        events.push(JSON.parse(line) as LogLine)
      },
    },
  )
  return { events, logger }
}
