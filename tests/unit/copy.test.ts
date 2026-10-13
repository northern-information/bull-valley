import { describe, expect, it } from 'vitest'
import { COPY, copy } from '../../src/copy.ts'
import { flatten, placeholders } from '../../src/copybook.ts'
import { ITEM_COPY_KEYS } from '../../src/itemcopy.ts'

// Every source file of the client and the Worker, as text.
const SOURCES: Record<string, string> = import.meta.glob(
  ['../../src/**/*.ts', '../../worker/**/*.ts'],
  { query: '?raw', import: 'default', eager: true }
)

// The keys passed to copy() as literals, across the client and the Worker.
// A ternary inside the call (copy(ok ? 'a' : 'b')) names both. A binding's
// labelKey and a mouse binding's buttonKey (bindings.ts) count too: hud.ts
// passes them to copy(). The items' words are asked for by id
// (itemcopy.ts), which says every key it reads.
function usedKeys(): Set<string> {
  const keys = new Set<string>(ITEM_COPY_KEYS)
  for (const text of Object.values(SOURCES)) {
    for (const call of text.matchAll(/\bcopy\(([^)]*)/g)) {
      for (const literal of call[1].matchAll(
        /'([a-z_]+(?:\.[a-z0-9_-]+)+)'/g
      )) {
        keys.add(literal[1])
      }
    }
    for (const label of text.matchAll(/\b(?:label|button)Key: '([a-z_.]+)'/g)) {
      keys.add(label[1])
    }
  }
  return keys
}

describe('COPY.toml', () => {
  it('parses into entries with a text and an author', () => {
    expect(COPY.size).toBeGreaterThan(0)
    for (const entry of COPY.values()) {
      expect(typeof entry.text).toBe('string')
      expect(['ai', 'tyler']).toContain(entry.by)
    }
  })

  it('has an entry for every key the code asks for', () => {
    const missing = [...usedKeys()].filter((key) => !COPY.has(key))
    expect(missing).toEqual([])
  })

  it('has no entry the code never asks for', () => {
    const used = usedKeys()
    const unused = [...COPY.keys()].filter((key) => !used.has(key))
    expect(unused).toEqual([])
  })

  it('names placeholders in camelCase within braces', () => {
    for (const [key, { text }] of COPY) {
      const braces = text.match(/[{}]/g)?.length ?? 0
      expect(braces, key).toBe(placeholders(text).length * 2)
    }
  })
})

describe('copy', () => {
  it('fills placeholders', () => {
    expect(copy('log.peer_joined', { name: 'Dave' })).toBe(
      COPY.get('log.peer_joined')?.text.replace('{name}', 'Dave')
    )
  })

  it('throws on an unknown key', () => {
    expect(() => copy('nope.nothing')).toThrow('COPY.toml has no nope.nothing')
  })

  it('throws on a missing var', () => {
    expect(() => copy('log.peer_joined')).toThrow('missing {name}')
  })

  it('throws on a var the text never names', () => {
    expect(() => copy('log.greeting', { name: 'Dave' })).toThrow(
      'has no {name}'
    )
  })
})

describe('flatten', () => {
  it('nests groups into dotted keys', () => {
    const entries = flatten({ a: { b: { text: 'Hi', by: 'ai' } } })
    expect(entries.get('a.b')).toEqual({ text: 'Hi', by: 'ai', names: [] })
  })

  it('finds the placeholders once, at load', () => {
    const entries = flatten({ a: { text: 'Hi {name}, {n}', by: 'ai' } })
    expect(entries.get('a')?.names).toEqual(['name', 'n'])
  })

  it('rejects an unknown author', () => {
    expect(() => flatten({ a: { text: 'Hi', by: 'claude' } })).toThrow(
      'a.by must be one of ai, tyler'
    )
  })

  it('rejects a text that is not a string', () => {
    expect(() => flatten({ a: { text: 3, by: 'ai' } })).toThrow(
      'a.text is not a string'
    )
  })

  it('rejects a bare value', () => {
    expect(() => flatten({ a: 'Hi' })).toThrow('a is not a table')
  })
})
