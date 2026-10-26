import { describe, expect, it } from 'vitest'
import { filmUrl } from '../../src/drivein.ts'
import { handleFilms, isFilmsPath, spanOf } from '../../worker/films.ts'
import type { FilmBucket } from '../../worker/films.ts'

const ORIGIN = 'https://bvsw.net'

// A bucket of named byte strings, enough of R2 for the routes: list pages
// `page` keys at a time, and a get reads its range out of the Range
// header the way R2 does.
function bucket(files: Record<string, string>, page = 1000): FilmBucket {
  const keys = Object.keys(files)
  return {
    list(options?: R2ListOptions) {
      const from = Number(options?.cursor ?? 0)
      const objects = keys
        .slice(from, from + page)
        .map((key) => ({ key }) as R2Object)
      const truncated = from + page < keys.length
      return Promise.resolve({
        objects,
        delimitedPrefixes: [],
        ...(truncated
          ? { truncated: true as const, cursor: String(from + page) }
          : { truncated: false as const }),
      })
    },
    get(key: string, options?: R2GetOptions) {
      const text = files[key]
      if (text === undefined) return Promise.resolve(null)
      const headers = options?.range as Headers | undefined
      const asked = headers?.get('Range')?.match(/^bytes=(\d*)-(\d*)$/)
      let range: R2Range | undefined
      let bytes = text
      if (asked) {
        if (asked[1] === '') {
          range = { suffix: Number(asked[2]) }
          bytes = text.slice(-Number(asked[2]))
        } else {
          const offset = Number(asked[1])
          const end = asked[2] === '' ? text.length - 1 : Number(asked[2])
          range = { offset, length: end - offset + 1 }
          bytes = text.slice(offset, end + 1)
        }
      }
      if (headers?.get('If-None-Match') === '"tag"') {
        return Promise.resolve({
          key,
          size: text.length,
          httpEtag: '"tag"',
          range,
          writeHttpMetadata: () => {},
        } as unknown as R2ObjectBody)
      }
      return Promise.resolve({
        key,
        size: text.length,
        httpEtag: '"tag"',
        range,
        body: new Response(bytes).body,
        writeHttpMetadata: () => {},
      } as unknown as R2ObjectBody)
    },
  }
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${ORIGIN}${path}`, { headers })

describe('the drive-in films', () => {
  it('owns /films and what lies under it, and nothing beside it', () => {
    expect(isFilmsPath('/films')).toBe(true)
    expect(isFilmsPath('/films/a.mp4')).toBe(true)
    expect(isFilmsPath('/filmsy')).toBe(false)
    expect(isFilmsPath('/ws')).toBe(false)
  })

  it('lists every film by name, in order, page after page, and nothing else', async () => {
    const films = bucket(
      {
        'zombies.mp4': '',
        'notes.txt': '',
        'night_of_the_living_dead.mp4': '',
        'trailers/a.mp4': '',
        'carnival of souls.mp4': '',
      },
      2
    )
    const res = await handleFilms(get('/films'), films)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(await res.json()).toEqual({
      films: [
        'carnival of souls.mp4',
        'night_of_the_living_dead.mp4',
        'zombies.mp4',
      ],
    })
  })

  it('lists none without a bucket', async () => {
    const res = await handleFilms(get('/films'), undefined)
    expect(await res.json()).toEqual({ films: [] })
  })

  it('serves a film whole, as video', async () => {
    const res = await handleFilms(
      get(filmUrl('carnival of souls.mp4')),
      bucket({ 'carnival of souls.mp4': '0123456789' })
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('video/mp4')
    expect(res.headers.get('Accept-Ranges')).toBe('bytes')
    expect(res.headers.get('Content-Length')).toBe('10')
    expect(await res.text()).toBe('0123456789')
  })

  it('serves the range asked for, so a video seeks', async () => {
    const films = bucket({ 'a.mp4': '0123456789' })
    const mid = await handleFilms(
      get('/films/a.mp4', { Range: 'bytes=2-5' }),
      films
    )
    expect(mid.status).toBe(206)
    expect(mid.headers.get('Content-Range')).toBe('bytes 2-5/10')
    expect(mid.headers.get('Content-Length')).toBe('4')
    expect(await mid.text()).toBe('2345')
    const tail = await handleFilms(
      get('/films/a.mp4', { Range: 'bytes=-3' }),
      films
    )
    expect(tail.headers.get('Content-Range')).toBe('bytes 7-9/10')
    expect(await tail.text()).toBe('789')
    const open = await handleFilms(
      get('/films/a.mp4', { Range: 'bytes=4-' }),
      films
    )
    expect(open.headers.get('Content-Range')).toBe('bytes 4-9/10')
    // Asked for from the start, the whole film comes back as a range.
    const all = await handleFilms(
      get('/films/a.mp4', { Range: 'bytes=0-' }),
      films
    )
    expect(all.status).toBe(206)
    expect(all.headers.get('Content-Range')).toBe('bytes 0-9/10')
    expect(await all.text()).toBe('0123456789')
  })

  it('answers a HEAD with no body, and a fresh copy with a 304', async () => {
    const films = bucket({ 'a.mp4': '0123456789' })
    const head = await handleFilms(
      new Request(`${ORIGIN}/films/a.mp4`, { method: 'HEAD' }),
      films
    )
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    const kept = await handleFilms(
      get('/films/a.mp4', { 'If-None-Match': '"tag"' }),
      films
    )
    expect(kept.status).toBe(304)
  })

  it('finds nothing for a name it would never show, or one not there', async () => {
    const films = bucket({ 'a.mp4': '0' })
    for (const path of [
      '/films/missing.mp4',
      '/films/a.txt',
      '/films/..%2Fa.mp4',
      '/films/%E0%A4%A',
    ]) {
      expect((await handleFilms(get(path), films)).status).toBe(404)
    }
    expect((await handleFilms(get('/films/a.mp4'), undefined)).status).toBe(404)
  })

  it('writes nothing', async () => {
    const res = await handleFilms(
      new Request(`${ORIGIN}/films/a.mp4`, { method: 'PUT', body: 'x' }),
      bucket({})
    )
    expect(res.status).toBe(405)
    expect(res.headers.get('Allow')).toBe('GET, HEAD')
  })

  it('reads the span R2 took, or none for the whole object', () => {
    expect(spanOf(undefined, 10)).toBeNull()
    expect(spanOf({ offset: 0, length: 10 }, 10)).toBeNull()
    expect(spanOf({ offset: 3 }, 10)).toEqual({ start: 3, end: 9 })
    expect(spanOf({ length: 4 }, 10)).toEqual({ start: 0, end: 3 })
    expect(spanOf({ suffix: 20 }, 10)).toBeNull()
    expect(spanOf({ offset: 8, length: 9 }, 10)).toEqual({ start: 8, end: 9 })
    expect(spanOf({ offset: 0 }, 0)).toBeNull()
    // Every field named, the unused ones undefined, as a local R2 says it.
    const open = { offset: 4, length: undefined, suffix: undefined }
    expect(spanOf(open as unknown as R2Range, 10)).toEqual({ start: 4, end: 9 })
  })
})
