import { describe, expect, it } from 'vitest'
import { ROSTER } from '../../src/characters.ts'
import { CONFIG } from '../../src/config.ts'
import { PSYCH_FUCHSIA } from '../../src/fuchsia.ts'
import {
  burstShards,
  conjure,
  dispel,
  flashAt,
  freshHallucinations,
  gapAt,
  lookOf,
  mostAt,
  NPC_COPIES,
  presenceAt,
  shardAt,
  shownAt,
  SOLIDS,
  spotFor,
  stepHallucinations,
  THING_KINDS,
} from '../../src/hallucinations.ts'
import { isKeyItem } from '../../src/items.ts'
import { mulberry32 } from '../../src/rng.ts'
import type {
  Hallucination,
  HallucinationState,
  Seeing,
} from '../../src/hallucinations.ts'

const cfg = CONFIG.hallucinations
const player = { x: 100, z: -40 }

const seeing = (time: number, over: Partial<Seeing> = {}): Seeing => ({
  time,
  tripping: 1,
  player,
  yaw: 0,
  ...over,
})

// Steps the state a frame at a time from `from` to `to` seconds.
function run(
  state: HallucinationState,
  from: number,
  to: number,
  over: Partial<Seeing> = {},
  dt = 0.1
): HallucinationState {
  let s = state
  for (let t = from; t <= to; t += dt) {
    s = stepHallucinations(s, seeing(t, over))
  }
  return s
}

const one = (over: Partial<Hallucination> = {}): Hallucination => ({
  id: 1,
  x: 0,
  z: 0,
  yaw: 0,
  born: 10,
  ends: 30,
  look: { shape: 'thing', kind: 'lsd' },
  ...over,
})

describe('the fuchsia', () => {
  it('is one hex colour', () => {
    expect(PSYCH_FUCHSIA).toMatch(/^#[0-9a-f]{6}$/)
  })
})

describe('when they come', () => {
  it('comes more often the further into the trip', () => {
    const rng = () => 0.5
    expect(gapAt(1, rng)).toBeCloseTo(cfg.gapSeconds.min)
    expect(gapAt(0, rng)).toBeCloseTo(cfg.gapSeconds.max)
    expect(gapAt(0.5, rng)).toBeLessThan(gapAt(0.2, rng))
  })

  it('stands more at once the further into the trip, none sober', () => {
    expect(mostAt(0)).toBe(0)
    expect(mostAt(0.01)).toBe(1)
    expect(mostAt(1)).toBe(cfg.most)
    expect(mostAt(0.5)).toBeLessThanOrEqual(cfg.most)
  })

  it('shows nothing sober', () => {
    const s = run(freshHallucinations(7), 0, 120, { tripping: 0 })
    expect(s.list).toEqual([])
    expect(s.nextAt).toBeNull()
  })

  it('shows the first a short way into a trip, and never more than the level allows', () => {
    const first = run(freshHallucinations(7), 0, cfg.gapSeconds.min)
    expect(first.list.length).toBeGreaterThan(0)
    let s = freshHallucinations(11)
    for (let t = 0; t < 600; t += 0.25) {
      s = stepHallucinations(s, seeing(t, { tripping: 0.4 }))
      expect(s.list.length).toBeLessThanOrEqual(mostAt(0.4))
    }
  })

  it('is the same from the same seed', () => {
    expect(run(freshHallucinations(3), 0, 60)).toEqual(
      run(freshHallucinations(3), 0, 60)
    )
  })

  it('stands them out ahead, within the cone and their distance, facing the raider', () => {
    let s = freshHallucinations(5)
    const seen: Hallucination[] = []
    for (let t = 0; t < 400; t += 0.25) {
      s = stepHallucinations(s, seeing(t, { yaw: 1 }))
      for (const h of s.list) {
        if (!seen.some((o) => o.id === h.id)) seen.push(h)
      }
    }
    expect(seen.length).toBeGreaterThan(10)
    for (const h of seen) {
      const dx = h.x - player.x
      const dz = h.z - player.z
      const d = Math.hypot(dx, dz)
      const band = h.look.shape === 'thing' ? cfg.thing : cfg.person
      expect(d).toBeGreaterThanOrEqual(band.near - 1e-9)
      expect(d).toBeLessThanOrEqual(band.far + 1e-9)
      // Ahead is (-sin yaw, -cos yaw); each within the cone of it.
      const ahead = Math.atan2(-dx, -dz)
      const off = Math.abs(Math.atan2(Math.sin(ahead - 1), Math.cos(ahead - 1)))
      expect(off).toBeLessThanOrEqual(cfg.cone + 1e-9)
      // Facing back at the raider: +Z turned by its yaw points at them.
      expect(Math.sin(h.yaw) * d).toBeCloseTo(-dx)
      expect(Math.cos(h.yaw) * d).toBeCloseTo(-dz)
    }
  })

  it('stands them from the height of the raider’s feet, when told it', () => {
    const low = run(freshHallucinations(5), 0, 200, { feet: -30 })
    expect(low.list.length).toBeGreaterThan(0)
    for (const h of low.list) expect(h.y).toBe(-30)
    for (const h of run(freshHallucinations(5), 0, 200).list) {
      expect(h).not.toHaveProperty('y')
    }
  })

  it('never comes behind a wall', () => {
    const s = run(freshHallucinations(5), 0, 200, { blocked: () => true })
    expect(s.list).toEqual([])
  })

  it('cuts them short when the trip ends, and drops them once gone', () => {
    let s = run(freshHallucinations(9), 0, 20)
    expect(s.list.length).toBeGreaterThan(0)
    s = stepHallucinations(s, seeing(21, { tripping: 0 }))
    for (const h of s.list) {
      expect(h.ends).toBeLessThanOrEqual(21 + cfg.fadeOutSeconds)
    }
    s = stepHallucinations(s, seeing(21 + cfg.fadeOutSeconds, { tripping: 0 }))
    expect(s.list).toEqual([])
  })

  it('leaves them behind once the raider strays far', () => {
    let s = run(freshHallucinations(9), 0, 20)
    expect(s.list.length).toBeGreaterThan(0)
    const away = { x: player.x + cfg.strayMetres * 3, z: player.z }
    s = stepHallucinations(s, seeing(21, { player: away, blocked: () => true }))
    for (const h of s.list) {
      expect(h.ends).toBeLessThanOrEqual(21 + cfg.fadeOutSeconds)
    }
  })
})

describe('who and what', () => {
  it('is a raider of the roster, one of the folk, or a pickup that is no key', () => {
    const rng = mulberry32(1)
    const shapes = new Set<string>()
    for (let i = 0; i < 400; i++) {
      const look = lookOf(rng)
      shapes.add(look.shape)
      if (look.shape === 'raider') {
        expect(ROSTER).toContain(look.outfit)
        expect(look.name).toBeGreaterThanOrEqual(0)
        expect(look.name).toBeLessThan(1)
      } else if (look.shape === 'npc') {
        expect(NPC_COPIES).toContain(look.npc)
      } else {
        expect(THING_KINDS).toContain(look.kind)
      }
    }
    expect([...shapes].sort()).toEqual(['npc', 'raider', 'thing'])
    expect(THING_KINDS.some(isKeyItem)).toBe(false)
  })

  it('keeps clear of the others', () => {
    const others = [{ x: player.x, z: player.z - 10 }]
    const rng = mulberry32(4)
    for (let i = 0; i < 50; i++) {
      const at = spotFor({ shape: 'npc', npc: 'gron' }, seeing(0), others, rng)
      if (at) {
        expect(
          Math.hypot(at.x - others[0].x, at.z - others[0].z)
        ).toBeGreaterThanOrEqual(cfg.spacing)
      }
    }
  })
})

describe('flickering in and out', () => {
  it('comes in, stands, and goes', () => {
    const h = one()
    expect(presenceAt(h, 9)).toBe(0)
    expect(presenceAt(h, 10)).toBe(0)
    expect(presenceAt(h, 10 + cfg.fadeInSeconds / 2)).toBeCloseTo(0.5)
    expect(presenceAt(h, 20)).toBe(1)
    expect(presenceAt(h, 30 - cfg.fadeOutSeconds / 2)).toBeCloseTo(0.5)
    expect(presenceAt(h, 30)).toBe(0)
  })

  it('shows whole while there, flickers coming, and not at all gone', () => {
    const h = one()
    expect(shownAt(h, 20)).toBe(true)
    expect(shownAt(h, 31)).toBe(false)
    // Many at the same presence, a half: about half of them show.
    let on = 0
    const many = 200
    for (let i = 0; i < many; i++) {
      if (shownAt({ ...h, id: i }, 10 + cfg.fadeInSeconds / 2)) on++
    }
    expect(on).toBeGreaterThan(many * 0.3)
    expect(on).toBeLessThan(many * 0.7)
  })
})

describe('E on one', () => {
  it('takes it away, and nothing for one already gone', () => {
    const state = { ...freshHallucinations(1), list: [one(), one({ id: 2 })] }
    const { state: after, gone } = dispel(state, 2)
    expect(gone?.id).toBe(2)
    expect(after.list.map((h) => h.id)).toEqual([1])
    expect(dispel(after, 2)).toEqual({ state: after, gone: null })
  })

  it('makes one at once out ahead for the dev hook, of the shape asked', () => {
    const { state, made } = conjure(freshHallucinations(2), seeing(5), 'thing')
    expect(made?.look.shape).toBe('thing')
    expect(state.list).toEqual([made])
    expect(state.next).toBe(2)
    const none = conjure(state, seeing(5, { blocked: () => true }))
    expect(none.made).toBeNull()
    expect(none.state).toBe(state)
  })
})

describe('the burst', () => {
  it('flings every solid out and up, from the seed alone', () => {
    const shards = burstShards(42)
    expect(shards).toHaveLength(cfg.burst.shards)
    expect(new Set(shards.map((s) => s.solid))).toEqual(new Set(SOLIDS))
    expect(burstShards(42)).toEqual(shards)
    for (const s of shards) {
      expect(s.velocity[1]).toBeGreaterThan(0)
      expect(Math.hypot(s.velocity[0], s.velocity[2])).toBeGreaterThan(0)
    }
    const half = burstShards(42, 0.5)
    expect(half[0].size).toBeCloseTo(shards[0].size / 2)
  })

  it('flies out, turns and fades, and is gone after its seconds', () => {
    const [shard] = burstShards(7)
    const start = shardAt(shard, 0)
    expect(start.at).toEqual([0, 0, 0])
    expect(start.scale).toBe(0)
    const mid = shardAt(shard, cfg.burst.seconds / 3)
    expect(Math.hypot(mid.at[0], mid.at[2])).toBeGreaterThan(0)
    expect(mid.scale).toBeGreaterThan(0)
    expect(mid.opacity).toBeGreaterThan(0)
    expect(mid.turn).not.toEqual([0, 0, 0])
    const late = shardAt(shard, cfg.burst.seconds * 0.9)
    expect(late.opacity).toBeLessThan(mid.opacity)
    expect(shardAt(shard, cfg.burst.seconds)).toEqual({
      at: [0, 0, 0],
      turn: [0, 0, 0],
      scale: 0,
      opacity: 0,
    })
  })

  it('flashes at once and is dark after its first quarter', () => {
    expect(flashAt(0)).toBe(1)
    expect(flashAt(-1)).toBe(0)
    expect(flashAt(cfg.burst.seconds / 8)).toBeCloseTo(0.5)
    expect(flashAt(cfg.burst.seconds / 4)).toBe(0)
  })
})
