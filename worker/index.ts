// The Cloudflare Worker in front of the game. Static assets are served
// before this runs (run_worker_first is off), so only requests with no file
// behind them arrive here: the WebSocket route goes to the valley's Durable
// Object, and anything else is handed to the assets binding for its 404.

import { VALLEY_NAME, VALLEY_PARAM, WS_PATH } from '../src/protocol.ts'
import { ValleyDO } from './ValleyDO.ts'

export { ValleyDO }

// Only a dev server may pick a valley by name; in production everyone
// shares the one valley whatever the query string says.
export function isDevHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

// The Durable Object name a request lands in.
export function valleyFor(url: URL): string {
  if (!isDevHost(url.hostname)) return VALLEY_NAME
  const picked = url.searchParams.get(VALLEY_PARAM)
  return picked && /^[\w-]{1,64}$/.test(picked) ? picked : VALLEY_NAME
}

export default {
  fetch(request, env): Promise<Response> | Response {
    const url = new URL(request.url)
    if (url.pathname === WS_PATH) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 })
      }
      const id = env.VALLEY.idFromName(valleyFor(url))
      return env.VALLEY.get(id).fetch(request)
    }
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
