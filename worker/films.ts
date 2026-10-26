// The drive-in's films (src/drivein.ts, sharedworld.ts rule 41), out of
// the FILMS R2 bucket: GET /films lists every .mp4 at the bucket's top
// level by name, and GET /films/<name> serves one, honouring Range, so a
// <video> can seek and loop without taking the whole file. Anyone may
// watch; nothing here writes. A film is put in the bucket with wrangler
// (wrangler.jsonc names the command).

import { FILMS_PATH, isFilmName } from '../src/drivein.ts'

// What of R2Bucket this reads, so a test can hand it a fake.
export type FilmBucket = Pick<R2Bucket, 'list' | 'get'>

export function isFilmsPath(pathname: string): boolean {
  return pathname === FILMS_PATH || pathname.startsWith(`${FILMS_PATH}/`)
}

// How long a browser may keep a film, and the list, before asking again:
// a name is never written over in place, so a film keeps.
const FILM_CACHE = 'public, max-age=86400'
const LIST_CACHE = 'no-store'

export async function handleFilms(
  request: Request,
  bucket: FilmBucket | undefined
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    })
  }
  const { pathname } = new URL(request.url)
  if (pathname === FILMS_PATH) return listFilms(bucket)
  let name: string
  try {
    name = decodeURIComponent(pathname.slice(FILMS_PATH.length + 1))
  } catch {
    return notFound()
  }
  if (!bucket || !isFilmName(name)) return notFound()
  return serveFilm(request, bucket, name)
}

// Every film's name, in order, read page by page.
async function listFilms(bucket: FilmBucket | undefined): Promise<Response> {
  const films: string[] = []
  if (bucket) {
    let cursor: string | undefined
    do {
      const page = await bucket.list({ cursor, limit: 1000 })
      for (const object of page.objects) {
        if (isFilmName(object.key)) films.push(object.key)
      }
      cursor = page.truncated ? page.cursor : undefined
    } while (cursor)
  }
  films.sort((a, b) => a.localeCompare(b))
  return Response.json({ films }, { headers: { 'Cache-Control': LIST_CACHE } })
}

async function serveFilm(
  request: Request,
  bucket: FilmBucket,
  name: string
): Promise<Response> {
  const ranged = request.headers.has('Range')
  const object = await bucket.get(name, {
    range: request.headers,
    onlyIf: request.headers,
  })
  if (!object) return notFound()
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set('ETag', object.httpEtag)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', FILM_CACHE)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'video/mp4')
  // A precondition that held back the body: the browser's copy is good.
  if (!('body' in object)) return new Response(null, { status: 304, headers })
  // A ranged ask is always answered as one, the whole film if that is what
  // it reached for: Safari plays only what comes back 206.
  const span =
    ranged && object.size > 0
      ? (spanOf(object.range, object.size) ?? {
          start: 0,
          end: object.size - 1,
        })
      : null
  if (span) {
    headers.set(
      'Content-Range',
      `bytes ${span.start}-${span.end}/${object.size}`
    )
    headers.set('Content-Length', String(span.end - span.start + 1))
  } else {
    headers.set('Content-Length', String(object.size))
  }
  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: span ? 206 : 200,
    headers,
  })
}

// The bytes R2 read for a ranged get, first to last inclusive, or null
// when it read the whole object.
export function spanOf(
  range: R2Range | undefined,
  size: number
): { start: number; end: number } | null {
  if (!range || size === 0) return null
  let start: number
  let length: number
  // R2 may name every field and leave the ones it did not use undefined,
  // so each is read by whether it holds a number.
  const {
    offset,
    length: asked,
    suffix,
  } = range as {
    offset?: number
    length?: number
    suffix?: number
  }
  if (typeof suffix === 'number') {
    length = Math.min(suffix, size)
    start = size - length
  } else {
    start = typeof offset === 'number' ? offset : 0
    length = typeof asked === 'number' ? asked : size - start
  }
  const end = Math.min(size, start + length) - 1
  if (start === 0 && end === size - 1) return null
  return { start, end }
}

function notFound(): Response {
  return new Response('Not found', { status: 404 })
}
