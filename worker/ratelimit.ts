// Rate limits on the /auth routes (worker/auth.ts), on the Workers rate
// limiting bindings in wrangler.jsonc. Two tiers: strict for the routes
// that start a sign-in or change an account, loose for the ones a page
// calls as it goes (the username check while typing, the session refresh
// before each socket). The limits are approximate and counted per
// Cloudflare location: they turn away a flood, not a careful attacker.
//
// The tier of a route is pure (tierFor) so its table is tested; the
// limiter itself is the bindings, failing open: a limiter that errors lets
// the request through rather than locking every raider out.

import { copy } from '../src/copy.ts'

export type Tier = 'strict' | 'loose'

// True when the request is within its limit.
export type Limiter = (tier: Tier, key: string) => Promise<boolean>

export const LIMITED_MESSAGE = copy('auth.limited')

// Seconds a limited client is told to wait: the bindings' period.
export const RETRY_AFTER_SECONDS = 60

// Every request is within its limit; for tests and for a Worker without
// the bindings.
export const unlimited: Limiter = () => Promise.resolve(true)

// The tier a route is limited under, or null when it is not limited:
// reading who is signed in, listing providers and signing out cost nothing
// to repeat; the provider's callback is already bound to a state cookie and
// stranding a raider mid-sign-in would be worse than the request; and the
// dev provider exists only on a dev server, where the e2e specs sign in
// many times a minute from one address. `parts` is the path after /auth.
export function tierFor(method: string, parts: readonly string[]): Tier | null {
  const [first, second, third] = parts
  if (first === 'dev') return null
  if (parts.length === 1) {
    if (method === 'POST' && first === 'confirm-signup') return 'strict'
    // Choosing a username, and changing it at Gron.
    if ((method === 'POST' || method === 'PUT') && first === 'username') {
      return 'strict'
    }
    if (method === 'POST' && first === 'refresh') return 'loose'
    // The character and finish, at the select and at Gron.
    if (method === 'PUT' && first === 'look') return 'loose'
    return null
  }
  if (parts.length === 2) {
    if (method === 'GET' && second === 'login') return 'strict'
    if (method === 'DELETE' && first === 'providers') return 'strict'
    return null
  }
  if (parts.length === 3) {
    if (method === 'GET' && first === 'link' && third === 'login') {
      return 'strict'
    }
    if (method === 'GET' && first === 'username' && third === 'available') {
      return 'loose'
    }
  }
  return null
}

export interface LimitBindings {
  AUTH_STRICT?: RateLimit
  AUTH_LOOSE?: RateLimit
}

// The limiter over the Worker's bindings.
export function limiterFrom(env: LimitBindings): Limiter {
  return async (tier, key) => {
    const binding = tier === 'strict' ? env.AUTH_STRICT : env.AUTH_LOOSE
    if (!binding) return true
    try {
      const { success } = await binding.limit({ key: `${tier}:${key}` })
      return success
    } catch (err) {
      console.warn('Rate limiter failed; letting the request through:', err)
      return true
    }
  }
}
