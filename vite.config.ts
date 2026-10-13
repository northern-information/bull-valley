import { readFile, writeFile } from 'node:fs/promises'
import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import { isGeo, serializeGeo } from './src/mapedit.ts'
import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'

const GEO_PATH = 'public/data/bull-valley/geo.json'

// The most a survey may be, in bytes: geo.json is well under a megabyte.
const MAX_BODY = 4 * 1024 * 1024

// Only the page the dev server itself served may save: a browser says so
// with Sec-Fetch-Site, and one that does not send it must name this server
// as its origin. Anything cross-site (a drive-by form post from another
// tab) is refused.
function fromThisServer(req: IncomingMessage): boolean {
  const site = req.headers['sec-fetch-site']
  if (site !== undefined) return site === 'same-origin'
  const { origin, host } = req.headers
  return typeof origin === 'string' && origin === `http://${host}`
}

// Akashic's Map mode saves the survey here (akashicmap.ts): a POST of the
// whole geo.json, written back minified. Dev server only; never in the
// build. Under e2e (--mode test) it refuses, so a spec never rewrites the
// committed map. The frame (bbox, metres, terrain) is the heightmap's and
// must come back unchanged.
function akashicMapSave(mode: string): Plugin {
  return {
    name: 'akashic-map-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__akashic/geo', (req, res) => {
        const reply = (status: number, message: string) => {
          res.statusCode = status
          res.setHeader('content-type', 'text/plain; charset=utf-8')
          res.end(message)
        }
        if (req.method !== 'POST') return reply(405, 'POST the survey')
        if (mode === 'test') return reply(403, 'saving is off under e2e')
        if (!fromThisServer(req)) return reply(403, 'not from Akashic')
        const chunks: Buffer[] = []
        let size = 0
        req.on('data', (c: Buffer) => {
          size += c.length
          if (size <= MAX_BODY) chunks.push(c)
        })
        req.on('end', () => {
          void (async () => {
            if (size > MAX_BODY) return reply(413, 'survey too big')
            let body: unknown
            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            } catch {
              return reply(400, 'not JSON')
            }
            if (!isGeo(body)) return reply(400, 'not a survey')
            const onDisk = JSON.parse(await readFile(GEO_PATH, 'utf8')) as {
              bbox: unknown
              metres: unknown
              terrain: unknown
            }
            for (const key of ['bbox', 'metres', 'terrain'] as const) {
              if (JSON.stringify(onDisk[key]) !== JSON.stringify(body[key])) {
                return reply(400, `${key} differs from the heightmap's`)
              }
            }
            await writeFile(GEO_PATH, serializeGeo(body))
            reply(200, 'saved')
          })().catch((err: unknown) => reply(500, String(err)))
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => ({
  // The Worker, its Durable Object, and the accounts database run in workerd
  // beside the dev server, so `npm run dev` is the whole stack. Dev state
  // (who was in the valley, who has an account) persists under
  // .wrangler/state. Under e2e it goes to .wrangler/state-test instead,
  // which the Playwright server command empties and migrates before every
  // run, so each run starts from an empty valley with the schema in place.
  plugins: [
    // Before the Worker, so its middleware sees the save first.
    akashicMapSave(mode),
    cloudflare({
      persistState: mode === 'test' ? { path: '.wrangler/state-test' } : true,
    }),
  ],
  server: { port: 5174 },
  build: { outDir: 'dist', emptyOutDir: true },
}))
