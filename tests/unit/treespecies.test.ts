import { describe, expect, it } from 'vitest'
import { TREE_SPECIES } from '../../src/roadsideparts.ts'
import { treeSpeciesAt } from '../../src/scatter.ts'

describe('treeSpeciesAt', () => {
  const grid = Array.from({ length: 200 }, (_, j) =>
    Array.from({ length: 200 }, (_, i) =>
      treeSpeciesAt((i + 0.5) / 200, (j + 0.5) / 200)
    )
  ).flat()

  it('grows every kind of tree, white oak the most', () => {
    const counts = new Map(TREE_SPECIES.map((s) => [s, 0]))
    for (const s of grid) counts.set(s, (counts.get(s) ?? 0) + 1)
    for (const s of TREE_SPECIES) expect(counts.get(s)).toBeGreaterThan(0)
    const most = Math.max(...counts.values())
    expect(counts.get('whiteOak')).toBe(most)
  })

  it('is the same kind for the same spot', () => {
    expect(treeSpeciesAt(0.31, 0.62)).toBe(treeSpeciesAt(0.31, 0.62))
  })

  it('gathers kinds into stands', () => {
    // Neighbours a few metres apart share a kind far more often than chance.
    let same = 0
    let pairs = 0
    for (let k = 0; k < 2000; k++) {
      const u = (k * 0.6180339) % 1
      const v = (k * 0.4142135) % 1
      pairs++
      if (treeSpeciesAt(u, v) === treeSpeciesAt(u + 0.0003, v)) same++
    }
    expect(same / pairs).toBeGreaterThan(0.45)
  })
})
