import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { copy } from '../../src/copy.ts'
import { npcInView, npcLine } from '../../src/npcs.ts'
import type { Vec3 } from '../../src/interfaces.ts'
import type { NpcSpot } from '../../src/npcs.ts'

const eye: Vec3 = [0, 1.6, 0]
const ahead: Vec3 = [0, 0, 1]

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
})

describe('npcInView', () => {
  const marx: NpcSpot = { id: 'marx', at: [0, 1.5, 2] }

  it('finds the NPC on the view ray within reach', () => {
    expect(npcInView([marx], eye, ahead)).toBe('marx')
  })

  it('ignores one out of reach or off to the side', () => {
    const far: NpcSpot = { id: 'marx', at: [0, 1.6, CONFIG.npcs.reach + 0.1] }
    expect(npcInView([far], eye, ahead)).toBeNull()
    expect(npcInView([marx], eye, [1, 0, 0])).toBeNull()
  })

  it('picks the NPC nearest the view ray', () => {
    const carlsten: NpcSpot = { id: 'carlsten', at: [0.4, 1.6, 2] }
    expect(npcInView([carlsten, marx], eye, ahead)).toBe('marx')
  })

  it('yields to a shelf facing nearer the view ray', () => {
    const carlsten: NpcSpot = { id: 'carlsten', at: [0.3, 1.6, 2] }
    expect(npcInView([carlsten], eye, ahead, 0.05)).toBeNull()
    expect(npcInView([carlsten], eye, ahead, 0.3)).toBe('carlsten')
  })
})
