import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The module map (docs/modules.md) names every module under src/ and
// worker/, so a reader can find any one from it. A module added, renamed
// or removed without its line in the map fails here rather than drifting.

const ROOT = new URL('../../', import.meta.url)
const DIRS = ['src', 'worker']

// Every `src/….ts` or `worker/….ts` the map names, in backticks.
function mapped(): Set<string> {
  const doc = readFileSync(new URL('docs/modules.md', ROOT), 'utf8')
  const paths = doc.matchAll(/`((?:src|worker)\/[\w.-]+\.ts)`/g)
  return new Set([...paths].map((m) => m[1]))
}

function modules(): string[] {
  return DIRS.flatMap((dir) =>
    readdirSync(new URL(`${dir}/`, ROOT))
      .filter((file) => file.endsWith('.ts'))
      .map((file) => `${dir}/${file}`)
  )
}

describe('the module map', () => {
  const named = mapped()

  it('names every module', () => {
    expect(modules().filter((file) => !named.has(file))).toEqual([])
  })

  it('names no module that is gone', () => {
    const gone = [...named].filter((file) => !existsSync(new URL(file, ROOT)))
    expect(gone).toEqual([])
  })
})
