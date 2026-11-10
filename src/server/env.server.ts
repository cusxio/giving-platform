import { parseEnv } from './env-rules'

export const {
  BASE_URL,
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
