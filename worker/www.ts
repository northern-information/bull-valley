// A Worker of its own on www.bvsw.net, bvsw.gay and www.bvsw.gay
// (wrangler.www.jsonc) that sends every request to the same path on the apex. It is not the game's Worker:
// that one serves static assets before its code runs, so it never sees a
// request for a file, and matching on the hostname there would mean running
// it first on every asset request.

export interface WwwEnv {
  APP_ORIGIN: string
}

// The apex URL for a request to any of those hosts: same path, same query string.
export function apexUrl(request: Request, origin: string): string {
  const url = new URL(request.url)
  return `${origin}${url.pathname}${url.search}`
}

export default {
  fetch(request, env): Response {
    return Response.redirect(apexUrl(request, env.APP_ORIGIN), 301)
  },
} satisfies ExportedHandler<WwwEnv>
