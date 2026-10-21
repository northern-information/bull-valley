import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import {
  atLaptop,
  caretOf,
  expandTabs,
  foldersOf,
  isFileBody,
  isFileId,
  isFileName,
  listingFor,
  normalizeBody,
  README_ID,
  saveRefusal,
} from '../../src/laptop.ts'
import type { LaptopFileRow } from '../../src/laptop.ts'

const row = (
  id: string,
  account: string,
  owner: string,
  name: string
): LaptopFileRow => ({ id, account, owner, name, size: 3, updated: 1 })

describe('the laptop', () => {
  it('names files plainly', () => {
    for (const name of ['notes.txt', 'New Text Document (2).txt', 'a_b-c']) {
      expect(isFileName(name), name).toBe(true)
    }
    for (const name of ['', ' lead', 'trail ', '.hidden', 'a/b', 'a\\b', 7]) {
      expect(isFileName(name), String(name)).toBe(false)
    }
    expect(isFileName('x'.repeat(CONFIG.laptop.nameMax))).toBe(true)
    expect(isFileName('x'.repeat(CONFIG.laptop.nameMax + 1))).toBe(false)
  })

  it('keeps every space, tab and line, and nothing stray', () => {
    const typed = '  two\tthree\r\n\r\nfour\rfive\u0007\u001b'
    expect(normalizeBody(typed)).toBe('  two\tthree\n\nfour\nfive')
    expect(isFileBody('ok\n\tfine  ')).toBe(true)
    expect(isFileBody('no\r\n')).toBe(false)
    expect(isFileBody('x'.repeat(CONFIG.laptop.bodyMax + 1))).toBe(false)
    expect(isFileBody(null)).toBe(false)
  })

  it('takes the store’s ids, never the readme’s', () => {
    expect(isFileId('a1b2c3')).toBe(true)
    expect(isFileId(README_ID)).toBe(false)
    expect(isFileId('A1')).toBe(false)
    expect(isFileId('x'.repeat(33))).toBe(false)
  })

  it('saves only the writer’s own, one of a name, so many', () => {
    const own = [
      { id: 'a', name: 'notes.txt' },
      { id: 'b', name: 'more.txt' },
    ]
    expect(saveRefusal(own, null, 'new.txt')).toBeNull()
    expect(saveRefusal(own, 'a', 'notes.txt')).toBeNull()
    expect(saveRefusal(own, 'z', 'any.txt')).toBe('not-yours')
    expect(saveRefusal(own, null, 'NOTES.TXT')).toBe('name-taken')
    expect(saveRefusal(own, 'b', 'notes.txt')).toBe('name-taken')
    const full = Array.from({ length: CONFIG.laptop.perAccount }, (_, i) => ({
      id: `f${i}`,
      name: `f${i}`,
    }))
    expect(saveRefusal(full, null, 'one more')).toBe('too-many')
    expect(saveRefusal(full, 'f0', 'f0')).toBeNull()
  })

  it('opens at a Citgo, never from nowhere', () => {
    const havens = [{ x: 0, z: 0 }]
    expect(atLaptop({ x: -15, z: 4 }, havens)).toBe(true)
    expect(atLaptop({ x: CONFIG.laptop.stationReach + 1, z: 0 }, havens)).toBe(
      false
    )
    expect(atLaptop(null, havens)).toBe(false)
  })

  it('lists by writer then name, saying which are the listener’s', () => {
    const rows = [
      row('c', 'acct-b', 'baker', 'zed'),
      row('a', 'acct-a', 'Able', 'b.txt'),
      row('b', 'acct-a', 'Able', 'A.txt'),
    ]
    const listed = listingFor(rows, 'acct-a')
    expect(listed.map((f) => f.id)).toEqual(['b', 'a', 'c'])
    expect(listed.map((f) => f.mine)).toEqual([true, true, false])
    expect(listed[0]).not.toHaveProperty('account')
  })

  it('folds the files into folders, the listener’s first and always there', () => {
    expect(foldersOf([], 'Me')).toEqual([
      { owner: 'Me', mine: true, files: [] },
    ])
    const files = listingFor(
      [
        row('a', 'acct-a', 'Able', 'one'),
        row('m', 'acct-me', 'Me', 'mine'),
        row('b', 'acct-a', 'Able', 'two'),
      ],
      'acct-me'
    )
    const folders = foldersOf(files, 'Me')
    expect(folders.map((f) => [f.owner, f.files.map((x) => x.id)])).toEqual([
      ['Me', ['m']],
      ['Able', ['a', 'b']],
    ])
  })

  it('finds the caret and expands tabs to the eighth column', () => {
    expect(caretOf('ab\ncd', 4)).toEqual({ line: 2, col: 2 })
    expect(caretOf('', 0)).toEqual({ line: 1, col: 1 })
    expect(caretOf('ab', 99)).toEqual({ line: 1, col: 3 })
    expect(expandTabs('a\tb')).toBe('a       b')
    expect(expandTabs('\t')).toBe('        ')
  })
})
