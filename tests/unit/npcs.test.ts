import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { npcLine, npcReach } from '../../src/npcs.ts'

describe('npcLine', () => {
  it('recites the stanzas in order, then starts over', () => {
    expect(npcLine('marx', 0)).toBe(copy('marx.stanza_1'))
    expect(npcLine('marx', 3)).toBe(copy('marx.stanza_4'))
    expect(npcLine('marx', 4)).toBe(copy('marx.stanza_1'))
  })

  it('cycles the clerk through his three lines', () => {
    expect(npcLine('carlsten', 0)).toBe(copy('carlsten.says_1'))
    expect(npcLine('carlsten', 1)).toBe(copy('carlsten.says_2'))
    expect(npcLine('carlsten', 2)).toBe(copy('carlsten.says_3'))
    expect(npcLine('carlsten', 3)).toBe(copy('carlsten.says_1'))
  })

  it('has Tyler say his three lines in turn', () => {
    expect(npcLine('tyler', 0)).toBe(copy('tyler.says_1'))
    expect(npcLine('tyler', 1)).toBe(copy('tyler.says_2'))
    expect(npcLine('tyler', 2)).toBe(copy('tyler.says_3'))
    expect(npcLine('tyler', 3)).toBe(copy('tyler.says_1'))
  })
})

describe('npcReach', () => {
  it('reaches each from where he stands or sits', () => {
    expect(npcReach('marx')).toBe(CONFIG.npcs.reach)
    expect(npcReach('moab')).toBe(CONFIG.moab.reach)
    expect(npcReach('tyler')).toBe(CONFIG.tyler.reach)
  })
})
