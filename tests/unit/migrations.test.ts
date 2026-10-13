import { readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// wrangler applies migrations/*.sql in lexical order and records each by
// its file name, so a number must never repeat or go backwards, and a file
// applied in production must never be renamed. The one exception is
// already in production: 0007_stashes.sql and 0007_tasks.sql share a
// number and stay as they are (see the header on each).

const MIGRATIONS = new URL('../../migrations/', import.meta.url)
const FROZEN_PAIR = ['0007_stashes.sql', '0007_tasks.sql']

function numberOf(file: string): number {
  const m = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(file)
  expect(m, `${file} is not NNNN_name.sql`).not.toBeNull()
  return Number(m?.[1])
}

describe('migrations', () => {
  const files = readdirSync(MIGRATIONS).sort()

  it('keep the frozen 0007 pair under their names', () => {
    expect(files.filter((f) => f.startsWith('0007_'))).toEqual(FROZEN_PAIR)
  })

  it('are numbered in order from 0001, the frozen pair aside', () => {
    const numbers = files.map(numberOf)
    expect(numbers[0]).toBe(1)
    for (let i = 1; i < files.length; i++) {
      const frozen =
        FROZEN_PAIR.includes(files[i]) && FROZEN_PAIR.includes(files[i - 1])
      const expected = frozen ? numbers[i - 1] : numbers[i - 1] + 1
      expect(numbers[i], `${files[i]} after ${files[i - 1]}`).toBe(expected)
    }
  })

  it('number every file from 0008 on uniquely and increasingly', () => {
    const later = files.map(numberOf).filter((n) => n >= 8)
    expect(later.length).toBeGreaterThan(0)
    expect(new Set(later).size).toBe(later.length)
    expect(later).toEqual([...later].sort((a, b) => a - b))
  })
})
