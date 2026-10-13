import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../src/config.ts'
import { mazeToWorld } from '../../src/maze.ts'
import { mulberry32 } from '../../src/rng.ts'
import { beamFrom } from '../../src/shadowmen.ts'
import {
  createTunnelShades,
  stepTunnelShades,
  tunnelShadesAt,
} from '../../src/tunnelshades.ts'
import { ROOMS, UNDERCROFT } from '../../src/undercroft.ts'
import type { XZ } from '../../src/interfaces.ts'
import type { Raider } from '../../src/shadowmen.ts'
import type { TunnelShade } from '../../src/tunnelshades.ts'

const place = { x: -7000, z: -7000, yaw: 0 }
const world = (p: XZ) => mazeToWorld(place, p)

function raider(at: XZ, over: Partial<Raider> = {}): Raider {
  const w = world(at)
  return { id: 'r', x: w.x, z: w.z, vulnerable: true, beam: null, ...over }
}

// A raider at `at` aiming their light at `target`, all in the Undercroft's
// metres.
function aiming(at: XZ, target: XZ): Raider {
  const from = world(at)
  const to = world(target)
  const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z))
  return raider(at, {
    beam: beamFrom({ x: from.x, y: 0, z: from.z }, yaw, -0.15, false),
  })
}

const run = (
  shades: TunnelShade[],
  raiders: Raider[],
  seconds: number,
  calm = false
) => {
  const rng = mulberry32(7)
  const struck: string[] = []
  const bursts: ReturnType<typeof stepTunnelShades>['bursts'] = []
  for (let t = 0; t < seconds; t += 0.1) {
    const out = stepTunnelShades(shades, rng, {
      dt: 0.1,
      raiders,
      place,
      calm,
    })
    struck.push(...out.struck)
    bursts.push(...out.bursts)
  }
  return { struck, bursts }
}

describe('the tunnel shades', () => {
  it('start in their lairs, the Warden before the altar', () => {
    const shades = createTunnelShades()
    expect(shades.filter((s) => s.kind === 'shade')).toHaveLength(
      UNDERCROFT.lairs.length
    )
    const warden = shades.find((s) => s.kind === 'warden')
    expect(warden).toMatchObject(UNDERCROFT.warden)
    expect(new Set(shades.map((s) => s.id)).size).toBe(shades.length)
  })

  it('drift round their lairs with no one below', () => {
    const shades = createTunnelShades()
    run(shades, [], 60)
    for (const shade of shades) {
      const d = Math.hypot(shade.x - shade.lair.x, shade.z - shade.lair.z)
      expect(d).toBeLessThanOrEqual(CONFIG.tunnel[shade.kind].patrolRadius + 1)
    }
  })

  it('hunt a raider they see down the passages, and strike them', () => {
    const shade = createTunnelShades()[0]
    const prey = { x: shade.lair.x + 4, z: shade.lair.z }
    const { struck } = run([shade], [raider(prey)], 10)
    expect(struck).toContain('r')
  })

  it('leave a raider alone when calm, or one who cannot be struck', () => {
    const shade = createTunnelShades()[0]
    const prey = { x: shade.lair.x + 4, z: shade.lair.z }
    expect(run([shade], [raider(prey)], 10, true).struck).toEqual([])
    const again = createTunnelShades()[0]
    expect(
      run([again], [raider(prey, { vulnerable: false })], 10).struck
    ).toEqual([])
  })

  it('burst in one beam held long enough, and form again in their lair', () => {
    const shade = createTunnelShades()[0]
    const from = { x: shade.lair.x + 5, z: shade.lair.z }
    const lit = aiming(from, shade)
    const { bursts } = run([shade], [{ ...lit, vulnerable: false }], 2)
    expect(bursts).toHaveLength(1)
    expect(bursts[0]).toMatchObject({ kind: 'shade', by: ['r'] })
    expect(tunnelShadesAt([shade], place)).toEqual([])
    run([shade], [], CONFIG.tunnel.shade.respawnSeconds + 1)
    expect(tunnelShadesAt([shade], place)).toHaveLength(1)
    expect(shade.burn).toBe(0)
  })

  it('make the Warden take far longer to burn', () => {
    expect(CONFIG.tunnel.warden.burnSeconds).toBeGreaterThan(
      CONFIG.tunnel.shade.burnSeconds * 3
    )
  })

  it('keep the Warden in its chamber: it hunts no one outside it', () => {
    const warden = createTunnelShades().find((s) => s.kind === 'warden')
    if (!warden) throw new Error('no Warden')
    // Just through the way out of the deep chamber, into the ossuary.
    const outside = { x: ROOMS.ossuary.x0 + 1, z: UNDERCROFT.warden.z + 3 }
    expect(run([warden], [raider(outside)], 10).struck).toEqual([])
    const inside = { x: UNDERCROFT.warden.x + 3, z: UNDERCROFT.warden.z }
    expect(run([warden], [raider(inside)], 10).struck).toContain('r')
  })
})
