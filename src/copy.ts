// Every player-facing string, from COPY.toml at the repo root (the rules
// are copybook.ts's). The client and the Worker both import this module;
// Vite inlines the file as text, so it ships in each bundle.

import source from '../COPY.toml?raw'
import { fill, readCopyBook } from './copybook.ts'
import type { CopyBook, CopyVars } from './copybook.ts'

export const COPY: CopyBook = readCopyBook(source)

// The text for a key in COPY.toml, its {placeholders} filled from vars.
export function copy(key: string, vars?: CopyVars): string {
  return fill(COPY, key, vars)
}
