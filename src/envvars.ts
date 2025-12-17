import { envSchema } from 'env-schema'
import { Type } from 'typebox'
import type { Static } from 'typebox'

const exporter = Type.String({
  pattern: '^(otlp|console|none)(,(otlp|console|none))*$',
})

const schema = Type.Object({
  BASE_URL: Type.Optional(Type.String()),
  NODE_ENV: Type.Union([
    Type.Literal('development'),
    Type.Literal('production'),
  ]),
  SESSION_SECRET: Type.String(),
  CRON_SECRET: Type.Optional(Type.String()),
  //
  DATABASE_AUTH_TOKEN: Type.Optional(Type.String()),
  DATABASE_URL: Type.String(),
  //
  EGHL_PASSWORD: Type.String(),
  EGHL_SERVICE_ID: Type.String(),
  EGHL_URL: Type.String(),
  //
  MAILERSEND_API_KEY: Type.Optional(Type.String()),
  MAILERSEND_ROOT_DOMAIN: Type.Optional(Type.String()),
  //
  OTEL_LOG_LEVEL: Type.Optional(Type.String()),
  OTEL_TRACES_EXPORTER: exporter,
  OTEL_LOGS_EXPORTER: exporter,
  OTEL_METRICS_EXPORTER: exporter,
})

const config = envSchema<Static<typeof schema>>({ schema })

export const {
  BASE_URL: BASE_URL_ENV,
  NODE_ENV,
  SESSION_SECRET,
  CRON_SECRET,
  //
  DATABASE_AUTH_TOKEN,
  DATABASE_URL,
  //kj
  EGHL_PASSWORD,
  EGHL_SERVICE_ID,
  EGHL_URL,
  //
  MAILERSEND_API_KEY,
  MAILERSEND_ROOT_DOMAIN,
  //
  OTEL_LOG_LEVEL,
  OTEL_LOGS_EXPORTER,
  OTEL_METRICS_EXPORTER,
  OTEL_TRACES_EXPORTER,
} = config

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
