// The Cloudflare Worker in front of the game. Static assets are served
// before this runs (run_worker_first is off), so only requests with no file
// behind them arrive here: the account routes are answered in place, the
// WebSocket route goes to the valley's Durable Object, and anything else is
// handed to the assets binding for its 404.

import { VALLEY_NAME, VALLEY_PARAM, WS_PATH } from '../src/protocol.ts'
import {
  ACCOUNT_HEADER,
  handleAuth,
  identityFor,
  isAuthPath,
  NAME_HEADER,
} from './auth.ts'
import { D1AccountStore } from './d1accounts.ts'
import { isDevHost } from './env.ts'
import { limiterFrom } from './ratelimit.ts'
import { ValleyDO } from './ValleyDO.ts'
import type { WorkerEnv } from './env.ts'

export { ValleyDO }
export { isDevHost }

// Set on the upgrade request for a dev server; ValleyDO reads it.
export const DEV_HEADER = 'x-bv-dev'

// The Durable Object name a request lands in. Only a dev server may pick a
// valley by name; in production everyone shares the one valley whatever
// the query string says.
export function valleyFor(url: URL): string {
  if (!isDevHost(url.hostname)) return VALLEY_NAME
  const picked = url.searchParams.get(VALLEY_PARAM)
  return picked && /^[\w-]{1,64}$/.test(picked) ? picked : VALLEY_NAME
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (isAuthPath(url.pathname)) {
      return handleAuth(request, env, {
        store: new D1AccountStore(env.DB),
        fetch: (input, init) => fetch(input, init),
        limit: limiterFrom(env),
      })
    }
    if (url.pathname === WS_PATH) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 })
      }
      const id = env.VALLEY.idFromName(valleyFor(url))
      // The stamps are never taken from the client. The dev stamp unlocks
      // the dev frames (hurry the clock, reset the valley); the identity
      // stamps name the signed-in raider once the access cookie verifies.
      const headers = new Headers(request.headers)
      headers.delete(DEV_HEADER)
      headers.delete(ACCOUNT_HEADER)
      headers.delete(NAME_HEADER)
      if (isDevHost(url.hostname)) headers.set(DEV_HEADER, '1')
      const identity = await identityFor(request, env)
      if (identity) {
        headers.set(ACCOUNT_HEADER, identity.account)
        headers.set(NAME_HEADER, identity.name)
      }
      return env.VALLEY.get(id).fetch(new Request(request, { headers }))
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<WorkerEnv>
