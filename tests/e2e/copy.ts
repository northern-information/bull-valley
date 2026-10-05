/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fill, readCopyBook } from '../../src/copybook.ts'
import type { CopyVars } from '../../src/copybook.ts'

// COPY.toml read from disk, so a spec asserts the text the game shows and
// an edit to the copy never breaks a spec.
const BOOK = readCopyBook(
  readFileSync(new URL('../../COPY.toml', import.meta.url), 'utf8')
)

export function copy(key: string, vars?: CopyVars): string {
  return fill(BOOK, key, vars)
}

// A key's text as a pattern, each placeholder matching any text: for a line
// whose filled-in part the spec does not know.
export function copyPattern(key: string): RegExp {
  const text = BOOK.get(key)?.text
  if (text === undefined) throw new Error(`COPY.toml has no ${key}`)
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/\\\{[a-zA-Z0-9]+\\\}/g, '.+')}$`)
}
