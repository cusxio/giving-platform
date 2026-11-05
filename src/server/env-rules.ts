interface SecretsEnv {
  readonly CRON_SECRET?: string | undefined
  readonly MAILERSEND_API_KEY?: string | undefined
  readonly NODE_ENV: 'development' | 'production'
  readonly SESSION_SECRET: string
}

const MIN_SESSION_SECRET_LENGTH = 32

/**
 * What a production deployment is missing. Without a mail key, login codes would go to a test
 * inbox; without a cron secret, both crons refuse every run; a short session secret weakens the
 * hash that stores login codes. Development may run without any of them.
 */
export function productionEnvProblems(env: SecretsEnv): string[] {
  if (env.NODE_ENV !== 'production') {
    return []
  }
  const problems: string[] = []
  if (env.MAILERSEND_API_KEY === undefined || env.MAILERSEND_API_KEY === '') {
    problems.push('MAILERSEND_API_KEY is required in production')
  }
  if (env.CRON_SECRET === undefined || env.CRON_SECRET === '') {
    problems.push('CRON_SECRET is required in production')
  }
  if (env.SESSION_SECRET.length < MIN_SESSION_SECRET_LENGTH) {
    problems.push(
      `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters in production`,
    )
  }
  return problems
}
