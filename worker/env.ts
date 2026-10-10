// The Worker's environment beyond what `wrangler types` generates. Secrets
// are set with `wrangler secret put` and never appear in wrangler.jsonc, so
// the generated Env only lists them when a .dev.vars file is present; they
// are declared here, optional, so a dev machine and CI type-check alike.

export interface AuthSecrets {
  // Signs the session tokens (worker/tokens.ts). Production refuses to
  // serve accounts without it; a dev server falls back to DEV_JWT_SECRET.
  JWT_SECRET?: string
  // The word a new raider must say (worker/auth.ts). Production refuses
  // every signup without it; a dev server falls back to DEV_MAGIC_WORD.
  MAGIC_WORD?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_SECRET?: string
  DISCORD_CLIENT_ID?: string
  DISCORD_CLIENT_SECRET?: string
  GITHUB_CLIENT_ID?: string
  GITHUB_CLIENT_SECRET?: string
}

export type WorkerEnv = Env & AuthSecrets

// Only a dev server may pick a valley by name, sign in with the dev
// provider, or run without a JWT secret; in production the hostname is the
// custom domain or the workers.dev fallback.
export function isDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

// The origin OAuth providers redirect back to and sign-in round trips land
// on. Production takes it from config, never from the Host header; a dev
// server is whatever the browser asked for.
export function appOrigin(env: WorkerEnv, url: URL): string {
  return isDevHost(url.hostname) ? url.origin : env.APP_ORIGIN
}

// Dev only. Anyone can read this, so a dev server's cookies prove nothing.
export const DEV_JWT_SECRET = 'bull-valley-dev-secret-do-not-use-in-prod'

// The signing secret for this request, or null when production has none.
export function jwtSecret(env: WorkerEnv, dev: boolean): string | null {
  if (env.JWT_SECRET) return env.JWT_SECRET
  return dev ? DEV_JWT_SECRET : null
}

// Dev only, like the dev secret: anyone can read it.
export const DEV_MAGIC_WORD = 'berries'

// The magic word for this request, lowercased, or null when production
// has none (and so takes no new raider).
export function magicWord(env: WorkerEnv, dev: boolean): string | null {
  const word = env.MAGIC_WORD?.trim().toLowerCase()
  if (word) return word
  return dev ? DEV_MAGIC_WORD : null
}
