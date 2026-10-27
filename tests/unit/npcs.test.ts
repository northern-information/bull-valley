import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { npcLine, npcName, npcReach } from '../../src/npcs.ts'

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

  it('has Jericho greet you, then tell you what passage would take', () => {
    expect(npcLine('jericho', 0)).toBe(copy('jericho.says_1'))
    expect(npcLine('jericho', 1)).toBe(copy('jericho.says_2'))
    expect(npcLine('jericho', 2)).toBe(copy('jericho.says_3'))
    expect(npcLine('jericho', 3)).toBe(copy('jericho.says_1'))
  })
})

describe('npcName', () => {
  it('names each by his outfit, and Jericho, who wears none, his own', () => {
    expect(npcName('tyler')).toBe(copy('outfits.tyler'))
    expect(npcName('jericho')).toBe(copy('jericho.name'))
  })
})

describe('npcReach', () => {
  it('reaches each from where he stands or sits', () => {
    expect(npcReach('marx')).toBe(CONFIG.npcs.reach)
    expect(npcReach('moab')).toBe(CONFIG.moab.reach)
    expect(npcReach('tyler')).toBe(CONFIG.tyler.reach)
    expect(npcReach('jericho')).toBe(CONFIG.castle.yard.jericho.reach)
  })
})
