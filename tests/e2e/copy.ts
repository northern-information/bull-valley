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
