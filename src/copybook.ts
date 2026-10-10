// Pure: the rules of COPY.toml, apart from how the file is loaded, so the
// game (copy.ts, through Vite) and the e2e specs (tests/e2e/copy.ts, from
// disk) read it the same way. Each entry is a table with the text and who
// wrote it:
//
//   [hud]
//   resume = { text = "Click to Resume", by = "ai" }
//
// `by` is "ai" until Tyler writes or approves the line, then "tyler".
// `{name}` in a text is a placeholder that fill() takes from its vars.

import { parse } from 'smol-toml'

const AUTHORS = ['ai', 'tyler'] as const

export type Author = (typeof AUTHORS)[number]

export interface CopyEntry {
  text: string
  by: Author
  // The placeholder names in the text, found once at load: fill() runs
  // every frame for some lines, and never parses the text again.
  names: readonly string[]
}

export type CopyBook = ReadonlyMap<string, CopyEntry>

export type CopyVars = Record<string, string | number>

const PLACEHOLDER = /\{([a-z][a-zA-Z0-9]*)\}/g

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Flattens the parsed tree into dotted keys. A table with a `text` field is
// an entry; anything else is a group. Throws on a malformed entry, so a bad
// edit to COPY.toml fails at load (and in the tests), never on screen.
export function flatten(
  tree: Record<string, unknown>,
  prefix = ''
): Map<string, CopyEntry> {
  const entries = new Map<string, CopyEntry>()
  for (const [name, value] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${name}` : name
    if (!isRecord(value)) {
      throw new Error(`COPY.toml: ${key} is not a table`)
    }
    if ('text' in value) {
      const { text, by } = value
      if (typeof text !== 'string') {
        throw new Error(`COPY.toml: ${key}.text is not a string`)
      }
      if (!AUTHORS.includes(by as Author)) {
        throw new Error(
          `COPY.toml: ${key}.by must be one of ${AUTHORS.join(', ')}`
        )
      }
      entries.set(key, { text, by: by as Author, names: placeholders(text) })
    } else {
      for (const [k, v] of flatten(value, key)) entries.set(k, v)
    }
  }
  return entries
}

// COPY.toml's source, parsed and checked.
export function readCopyBook(source: string): CopyBook {
  return flatten(parse(source))
}

// The placeholder names in a text, in order of appearance.
export function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1])
}

// The text for a key, its placeholders filled. Throws on an unknown key, a
// placeholder with no var, or a var the text never names: each is a bug in
// the call site or in COPY.toml.
export function fill(book: CopyBook, key: string, vars?: CopyVars): string {
  const entry = book.get(key)
  if (!entry) throw new Error(`COPY.toml has no ${key}`)
  const { text, names } = entry
  if (vars) {
    for (const name of Object.keys(vars)) {
      if (!names.includes(name)) {
        throw new Error(`COPY.toml ${key} has no {${name}}`)
      }
    }
  }
  if (names.length === 0) return text
  return text.replace(PLACEHOLDER, (_, name: string) => {
    if (!vars || !(name in vars)) {
      throw new Error(`copy(${key}) is missing {${name}}`)
    }
    return String(vars[name])
  })
}
