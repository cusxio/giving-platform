import { parseEnv } from './env-rules'

export const {
  BASE_URL: BASE_URL_ENV,
  NODE_ENV,
  SESSION_SECRET,
  CRON_SECRET,
  //
  DATABASE_URL,
  //
  EGHL_PASSWORD,
  EGHL_SERVICE_ID,
  EGHL_URL,
  //
  mail: MAIL,
  //
  OTEL_LOG_LEVEL,
  OTEL_LOGS_EXPORTER,
  OTEL_TRACES_EXPORTER,
} = parseEnv(process.env)

function getBaseURL() {
  if (BASE_URL_ENV !== undefined) {
    return BASE_URL_ENV
  }

  if (process.env.VERCEL_URL !== undefined) {
    return `https://${process.env.VERCEL_URL}`
  }

  if (NODE_ENV === 'development') {
    return 'http://localhost:3003'
  }

  throw new Error('Missing `BASE_URL`')
}

export const BASE_URL = getBaseURL()
