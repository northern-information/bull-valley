// Pure: Castle Entropy as it stands today. The castle floats over the
// moat's island (moat.ts) and is made anew every Central day (daily.ts
// dayKey): `castleOf(day)` draws it from a seed of the day, so every
// raider sees the same castle all day and a different one tomorrow, with
// nothing on the wire. It is brutalist masses on a coarse grid of cells
// (CONFIG.castle.cell), stacked story on story, so a later turn of its
// parts, like a Rubik's cube's, has whole cells to move; gothic spires on
// the highest, flying buttresses from the low masses to the tall, gargoyles
// on the corners, the craggy rock it floats on, and one lighthouse at its
// edge, whose blue beam turns on the shared clock (`lighthouseAngle`).
//
// Everything is in the moat's own frame (moat-local metres from the
// island's middle), y up from the castle's base, which floats
// CONFIG.castle.float over the rim. No three.js, no DOM.

import { CONFIG } from './config.ts'
import { pointInPolygon } from './coords.ts'
import { MOAT } from './moat.ts'
import { mulberry32 } from './rng.ts'
import type { Rng } from './rng.ts'

type CastleConfig = typeof CONFIG.castle

// A brutalist mass: a box `w` by `d` cells' worth of metres, from `y` up
// `h`, its middle at (x, z), with `rows` of window slits.
interface Mass {
  x: number
  z: number
  y: number
  w: number
  d: number
  h: number
  rows: number
}

// A gothic spire on a mass's roof: a tall cone of `radius` from `y` up
// `h`, with `crockets` up its edges.
interface Spire {
  x: number
  z: number
  y: number
  radius: number
  h: number
  crockets: number
}

// A flying buttress, an arc from a low roof's edge to a tall mass's side.
interface Buttress {
  from: { x: number; y: number; z: number }
  to: { x: number; y: number; z: number }
}

// A gargoyle crouched on a roof's corner, looking out along `yaw`.
interface Gargoyle {
  x: number
  y: number
  z: number
  yaw: number
}

// The lighthouse: a round tower of `radius` from `y` up `h`, the lamp on
// top.
interface Lighthouse {
  x: number
  z: number
  y: number
  radius: number
  h: number
}

// A shard of the rock the castle floats on, hanging `depth` under the base.
interface Shard {
  x: number
  z: number
  radius: number
  depth: number
}

export interface CastleLayout {
  day: string
  masses: Mass[]
  spires: Spire[]
  buttresses: Buttress[]
  gargoyles: Gargoyle[]
  lighthouse: Lighthouse
  rock: Shard[]
}

// One story of a mass.
const STORY = 4

// FNV-1a over the day's key, the seed of the castle.
export function seedOf(day: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < day.length; i++) {
    h ^= day.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const ISLAND_RING = MOAT.island.map((p) => [p.x, p.z] as [number, number])

// Whether the whole square of half-size `half` round (x, z) stands over
// the island.
function overIsland(x: number, z: number, half: number): boolean {
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].every(([sx, sz]) =>
    pointInPolygon(x + sx * half, z + sz * half, ISLAND_RING)
  )
}

const between = (rng: Rng, lo: number, hi: number) =>
  lo + Math.floor(rng() * (hi - lo + 1))

// The castle on `day` (a dayKey).
export function castleOf(
  day: string,
  cfg: CastleConfig = CONFIG.castle
): CastleLayout {
  const rng = mulberry32(seedOf(day))
  // Neighbouring seeds start close; the first draw parts them.
  rng()
  const cell = cfg.cell
  // The cells over the island, a cell's margin in from its edge.
  const cells: { i: number; j: number }[] = []
  const span = Math.ceil(cfg.moat.island / cell) + 1
  for (let i = -span; i <= span; i++) {
    for (let j = -span; j <= span; j++) {
      if (overIsland(i * cell, j * cell, cell)) cells.push({ i, j })
    }
  }
  const top = new Map<string, number>()
  const key = (i: number, j: number) => `${i},${j}`
  const topOf = (i: number, j: number) => top.get(key(i, j)) ?? 0

  // The masses: the keep in the middle first, then the rest spread over
  // the island, leaning toward the middle (the nearer of two draws), each
  // landing on what is under it, none stacked past `stack`.
  const masses: Mass[] = []
  const count = between(rng, cfg.masses.min, cfg.masses.max)
  const near = (c: { i: number; j: number }) => c.i * c.i + c.j * c.j
  for (let m = 0; m < count; m++) {
    const one = cells[Math.floor(rng() * cells.length)]
    const two = cells[Math.floor(rng() * cells.length)]
    const at = m === 0 ? { i: 0, j: 0 } : near(one) <= near(two) ? one : two
    const wide = m === 0 || rng() < 0.45 ? 2 : 1
    const deep = m === 0 || rng() < 0.45 ? 2 : 1
    const footprint: { i: number; j: number }[] = []
    for (let di = 0; di < wide; di++) {
      for (let dj = 0; dj < deep; dj++) {
        const c = cells.find((k) => k.i === at.i + di && k.j === at.j + dj)
        if (c) footprint.push(c)
      }
    }
    const fw = new Set(footprint.map((c) => c.i)).size
    const fd = new Set(footprint.map((c) => c.j)).size
    if (footprint.length === 0 || footprint.length !== fw * fd) continue
    const base = Math.max(...footprint.map((c) => topOf(c.i, c.j)))
    const room = Math.floor((cfg.stack - base) / STORY)
    if (room < 2) continue
    const h = between(rng, 2, Math.min(m === 0 ? 7 : 5, room)) * STORY
    const i0 = Math.min(...footprint.map((c) => c.i))
    const j0 = Math.min(...footprint.map((c) => c.j))
    masses.push({
      x: (i0 + (fw - 1) / 2) * cell,
      z: (j0 + (fd - 1) / 2) * cell,
      y: base,
      w: fw * cell,
      d: fd * cell,
      h,
      rows: h / STORY,
    })
    for (const c of footprint) top.set(key(c.i, c.j), base + h)
  }
  // A castle of no mass is no castle: the middle cell, at the least.
  if (masses.length === 0) {
    masses.push({ x: 0, z: 0, y: 0, w: cell, d: cell, h: STORY * 3, rows: 3 })
    top.set(key(0, 0), STORY * 3)
  }

  // The roofs, highest first: each mass's own top.
  const roofs = masses
    .filter((m) => topAt(top, cell, m) === m.y + m.h)
    .sort((a, b) => b.y + b.h - (a.y + a.h))

  const spires: Spire[] = []
  const spireCount = between(rng, cfg.spires.min, cfg.spires.max)
  for (let s = 0; s < spireCount && roofs.length > 0; s++) {
    // The tallest roofs most of all.
    const roof = roofs[Math.floor(rng() * rng() * roofs.length)]
    const radius = 1.2 + rng() * 1.6
    const room = Math.max(0, Math.min(roof.w, roof.d) / 2 - radius)
    spires.push({
      x: roof.x + (rng() * 2 - 1) * room,
      z: roof.z + (rng() * 2 - 1) * room,
      y: roof.y + roof.h,
      radius,
      h: 10 + rng() * 18,
      crockets: between(rng, 3, 7),
    })
  }

  // Flying buttresses: from a roof's edge to the side of a taller mass
  // beside it.
  const buttresses: Buttress[] = []
  for (const low of roofs) {
    const lowTop = low.y + low.h
    const tall = masses.find(
      (m) =>
        m !== low &&
        m.y + m.h > lowTop + STORY * 2 &&
        Math.abs(m.x - low.x) <= (m.w + low.w) / 2 + cell &&
        Math.abs(m.z - low.z) <= (m.d + low.d) / 2 + cell
    )
    if (!tall || rng() < 0.3) continue
    const dx = tall.x - low.x
    const dz = tall.z - low.z
    const len = Math.hypot(dx, dz) || 1
    buttresses.push({
      from: {
        x: low.x - (dx / len) * (low.w / 2),
        y: lowTop,
        z: low.z - (dz / len) * (low.d / 2),
      },
      to: {
        x: tall.x - (dx / len) * (tall.w / 2),
        y: Math.min(tall.y + tall.h, lowTop + STORY * 3),
        z: tall.z - (dz / len) * (tall.d / 2),
      },
    })
  }

  // Gargoyles on the corners of the roofs, looking out.
  const gargoyles: Gargoyle[] = []
  for (const roof of roofs) {
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      if (rng() < 0.55) continue
      gargoyles.push({
        x: roof.x + (sx * roof.w) / 2,
        y: roof.y + roof.h,
        z: roof.z + (sz * roof.d) / 2,
        yaw: Math.atan2(sz, sx),
      })
    }
  }

  // The lighthouse, on the outermost cell, over everything.
  const outermost = [...cells].sort(
    (a, b) => b.i * b.i + b.j * b.j - (a.i * a.i + a.j * a.j)
  )
  const edge = outermost[Math.floor(rng() * Math.min(5, outermost.length))]
  const highest = Math.max(...masses.map((m) => m.y + m.h))
  const lighthouse: Lighthouse = {
    x: edge.i * cell,
    z: edge.j * cell,
    y: topOf(edge.i, edge.j),
    radius: 2.4,
    h: highest + 10 - topOf(edge.i, edge.j),
  }

  // The rock it floats on: shards under the footprint, the deepest in the
  // middle.
  const rock: Shard[] = cells.map((c) => {
    const out = Math.hypot(c.i, c.j) / (span || 1)
    return {
      x: c.i * cell + (rng() * 2 - 1) * cell * 0.3,
      z: c.j * cell + (rng() * 2 - 1) * cell * 0.3,
      radius: cell * (0.6 + rng() * 0.3),
      depth: (1 - out * 0.7) * (8 + rng() * 14),
    }
  })

  return { day, masses, spires, buttresses, gargoyles, lighthouse, rock }
}

// The top of a mass's footprint as it was left: its own roof unless
// something stood on it.
function topAt(top: Map<string, number>, cell: number, m: Mass): number {
  let highest = 0
  for (let x = m.x - m.w / 2 + cell / 2; x < m.x + m.w / 2; x += cell) {
    for (let z = m.z - m.d / 2 + cell / 2; z < m.z + m.d / 2; z += cell) {
      const k = `${Math.round(x / cell)},${Math.round(z / cell)}`
      highest = Math.max(highest, top.get(k) ?? 0)
    }
  }
  return highest
}

// Which way the lighthouse's beam points at `seconds` on the shared clock,
// radians round from moat-local +x.
export function lighthouseAngle(
  seconds: number,
  cfg = CONFIG.castle.lighthouse
): number {
  const turns = (seconds * cfg.rpm) / 60
  return (turns - Math.floor(turns)) * Math.PI * 2
}

// How far the castle has bobbed at `seconds`, in metres up or down.
export function bobAt(seconds: number, cfg = CONFIG.castle.bob): number {
  return Math.sin((seconds / cfg.seconds) * Math.PI * 2) * cfg.metres
}
