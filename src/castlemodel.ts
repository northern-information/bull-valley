import * as THREE from 'three'
import {
  artTexture,
  castShadows,
  isMesh,
  lambert,
  LIGHT_BEAM,
  makeGlowTexture,
  memo,
  mergeStatic,
  setMotion,
} from './assetkit.ts'
import { bobAt, lighthouseAngle, seedOf, SLAB } from './castle.ts'
import { CONFIG } from './config.ts'
import { chunkAt, fragmentAt, ruinsAt } from './crumble.ts'
import { MOAT } from './moat.ts'
import { concreteArt } from './moatart.ts'
import { mulberry32, range } from './rng.ts'
import { buildForm, pillowBox, pillowOut } from './spomenikmodel.ts'
import type { CastleLayout } from './castle.ts'
import type { Fragment, Ruin } from './crumble.ts'

// Castle Entropy as seen, from a day's layout (castle.ts castleOf): the
// rock it floats on and the slab over it, the brutalist masses in poured
// concrete with their window slits and heavy cornices, the gothic spires
// in dark stone bristling with crockets, the flying buttresses arcing from
// the low roofs up to the tall, the gargoyles on the corners, and the
// lighthouse at the edge, its lamp a cold blue that takes no fog and its
// two beams sweeping the valley on the shared clock. Origin at the
// castle's base over the island's middle, in the moat's own frame (turn the
// group by the place's yaw); `update(t)` bobs it and turns the beams, `t`
// the shared clock in seconds.

export interface CastleRig {
  group: THREE.Group
  update(t: number): void
  // Frees what the castle built for itself (it is built anew each day).
  dispose(): void
}

const concreteTexture = memo((id: string) => {
  const texture = artTexture(concreteArt(id))
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  return texture
})

// A box whose uvs run in metres over `panel`, so the concrete's panels
// keep their size on a mass of any size.
function slab(
  w: number,
  h: number,
  d: number,
  panel: number
): THREE.BoxGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d)
  const uv = geometry.getAttribute('uv')
  const normal = geometry.getAttribute('normal')
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normal.getX(i))
    const ny = Math.abs(normal.getY(i))
    const across = nx > 0.5 ? d : w
    const up = ny > 0.5 ? d : h
    uv.setXY(i, (uv.getX(i) * across) / panel, (uv.getY(i) * up) / panel)
  }
  return geometry
}

// A lancet window's pane, `w` wide and `h` tall to its point, its sill at
// the origin, facing +z.
function lancetGeometry(w: number, h: number): THREE.ShapeGeometry {
  const half = w / 2
  const spring = h - w * 0.9
  const shape = new THREE.Shape()
  shape.moveTo(-half, 0)
  shape.lineTo(half, 0)
  shape.lineTo(half, spring)
  shape.quadraticCurveTo(half, h - w * 0.3, 0, h)
  shape.quadraticCurveTo(-half, h - w * 0.3, -half, spring)
  shape.lineTo(-half, 0)
  return new THREE.ShapeGeometry(shape, 3)
}

export function buildCastle(layout: CastleLayout): CastleRig {
  const group = new THREE.Group()
  group.name = 'castle-entropy'
  // Everything that bobs, under the group (the group itself is placed).
  const body = new THREE.Group()
  group.add(body)
  const rng = mulberry32(0xca57e)
  const concrete = lambert({ map: concreteTexture('#7d7b77') })
  const pale = lambert({ map: concreteTexture('#8f8c86') })
  const stone = lambert({ map: concreteTexture('#4e4c4a') })
  const darkStone = lambert({ color: '#2e2d2c' })
  const rock = lambert({ color: '#3a3631' })
  const slit = lambert({
    color: '#0c0b0a',
    emissive: new THREE.Color('#2e2216'),
    emissiveIntensity: 0.25,
  })
  const metal = lambert({ color: '#4a4947' })
  const pipe = lambert({ color: '#5a4636' })
  // The spomeniks' concrete, seen from inside a split boulder too.
  const formConcrete = lambert({
    map: concreteTexture('#8f8c86'),
    side: THREE.DoubleSide,
  })
  const slate = lambert({ color: '#262524' })
  // The old glass, gone the colour of smoke and dirt, lit faintly from
  // within: grey, umber and near black by turns.
  const glass = ['#33302d', '#3f3122', '#1c1b1a'].map((color) =>
    lambert({
      color: '#0c0b0a',
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.7,
      side: THREE.DoubleSide,
    })
  )
  let pane = 0
  const glassOf = () => glass[pane++ % glass.length]
  // A lancet: a tall window with a pointed arch, standing on its sill.
  const lancet = lancetGeometry(0.9, 2.8)

  // Where the next parts go: the body, or the piece of it (a mass and all
  // that stands on it, a buttress) that can break away and grow back.
  let into: THREE.Object3D = body

  const add = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    rotY = 0
  ) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.rotation.y = rotY
    into.add(mesh)
    return mesh
  }
  const strut = (
    a: THREE.Vector3,
    b: THREE.Vector3,
    size: number,
    material: THREE.Material
  ) => {
    const length = a.distanceTo(b)
    if (length < 1e-3) return
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, length, size),
      material
    )
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize()
    )
    into.add(mesh)
  }

  // The slab the castle stands on: the island's shape, drawn in a little.
  const shape = new THREE.Shape(
    MOAT.island.map((p) => new THREE.Vector2(p.x * 0.88, p.z * 0.88))
  )
  const base = new THREE.ExtrudeGeometry(shape, {
    depth: SLAB,
    bevelEnabled: false,
  })
  base.rotateX(Math.PI / 2)
  add(base, concrete, 0, 0, 0)

  // The rock under it, shards hanging point down.
  for (const shard of layout.rock) {
    const cone = new THREE.ConeGeometry(shard.radius, shard.depth, 5)
    cone.rotateX(Math.PI)
    const mesh = add(cone, rock, shard.x, -SLAB - shard.depth / 2, shard.z)
    mesh.rotation.y = rng() * Math.PI
  }
  // Loose stones and torn-off rebar hanging under it.
  for (let i = 0; i < 18; i++) {
    const s = layout.rock[Math.floor(rng() * layout.rock.length)]
    const down = range(rng, 2, s.depth * 0.7)
    const at = new THREE.Vector3(
      s.x + range(rng, -2, 2),
      -SLAB,
      s.z + range(rng, -2, 2)
    )
    strut(at, at.clone().add(new THREE.Vector3(0, -down, 0)), 0.06, metal)
    add(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      rock,
      at.x,
      at.y - down,
      at.z,
      rng()
    )
  }

  // Each mass and each buttress hangs off a pivot at its foot, so it can
  // crumble down into it and grow back up out of it (crumble.ts).
  const pivotAt = (x: number, y: number, z: number) => {
    const pivot = new THREE.Group()
    pivot.position.set(x, y, z)
    const inner = new THREE.Group()
    inner.position.set(-x, -y, -z)
    pivot.add(inner)
    body.add(pivot)
    return { pivot, inner }
  }
  const massPieces = layout.masses.map((m) => pivotAt(m.x, m.y, m.z))
  const buttressPieces = layout.buttresses.map((b) =>
    pivotAt(b.from.x, b.from.y, b.from.z)
  )
  const onMass = (index: number) => {
    into = massPieces[index]?.inner ?? body
  }

  // The church's masses, in stone: buttress piers down their long sides,
  // a row of lancets a story, a steep slate gable, a rose window in each
  // gable end.
  for (const [index, m] of layout.masses.entries()) {
    if (m.style !== 'stone') continue
    onMass(index)
    add(slab(m.w, m.h, m.d, 6), stone, m.x, m.y + m.h / 2, m.z)
    // Along the ridge, and across it.
    const along = m.ridge === 'x' ? m.w : m.d
    const across = m.ridge === 'x' ? m.d : m.w
    const turn = m.ridge === 'x' ? 0 : Math.PI / 2
    // A point on the mass in its own frame: `a` along the ridge, `c`
    // across it, `y` up.
    const at = (a: number, c: number, y: number) =>
      m.ridge === 'x'
        ? new THREE.Vector3(m.x + a, y, m.z + c)
        : new THREE.Vector3(m.x + c, y, m.z + a)
    const rise = across * 0.75
    const gable = new THREE.ExtrudeGeometry(
      new THREE.Shape([
        new THREE.Vector2(-across / 2 - 0.4, 0),
        new THREE.Vector2(across / 2 + 0.4, 0),
        new THREE.Vector2(0, rise),
      ]),
      { depth: along + 0.4, bevelEnabled: false }
    )
    gable.translate(0, 0, -(along + 0.4) / 2)
    // Extruded along z, the ridge; turned to lie along x unless it runs
    // along z.
    add(gable, slate, m.x, m.y + m.h, m.z, m.ridge === 'x' ? Math.PI / 2 : 0)
    const stories = Math.max(1, m.rows)
    for (const side of [-1, 1]) {
      // The piers, stepping out at the foot.
      for (let a = -along / 2; a <= along / 2 + 0.01; a += along / 3) {
        const foot = at(a, side * (across / 2 + 0.5), m.y + m.h * 0.3)
        add(
          new THREE.BoxGeometry(1, m.h * 0.6, 1),
          stone,
          foot.x,
          foot.y,
          foot.z,
          turn
        )
        const upper = at(a, side * (across / 2 + 0.3), m.y + m.h * 0.75)
        add(
          new THREE.BoxGeometry(0.7, m.h * 0.5, 0.7),
          stone,
          upper.x,
          upper.y,
          upper.z,
          turn
        )
      }
      // The lancets between them, a row a story.
      for (let r = 0; r < stories; r++) {
        const y = m.y + (r + 0.35) * (m.h / stories)
        for (let a = -along / 2 + along / 6; a < along / 2; a += along / 3) {
          const p = at(a, side * (across / 2 + 0.06), y)
          const pane = new THREE.Mesh(lancet, glassOf())
          pane.position.copy(p)
          pane.rotation.y = turn + (side > 0 ? 0 : Math.PI)
          into.add(pane)
        }
      }
    }
    // A rose window under each gable's peak.
    const rose = Math.min(across * 0.28, 2.6)
    for (const end of [-1, 1]) {
      const p = at(end * (along / 2 + 0.08), 0, m.y + m.h - rose - 0.8)
      const wheel = new THREE.Mesh(
        new THREE.CircleGeometry(rose, 12),
        glassOf()
      )
      wheel.position.copy(p)
      wheel.rotation.y = turn + (end > 0 ? Math.PI / 2 : -Math.PI / 2)
      into.add(wheel)
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(rose, 0.22, 4, 12),
        stone
      )
      rim.position.copy(p)
      rim.rotation.y = wheel.rotation.y
      into.add(rim)
      for (let k = 0; k < 6; k++) {
        const spoke = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, rose * 2, 0.12),
          stone
        )
        spoke.position.copy(p)
        spoke.rotation.set(0, wheel.rotation.y, (k / 6) * Math.PI)
        into.add(spoke)
      }
    }
  }

  // The concrete gone strange: swollen out of its box like a pillow, its
  // slits riding the swell.
  for (const [index, m] of layout.masses.entries()) {
    if (m.style !== 'concrete') continue
    onMass(index)
    add(pillowBox(m.w, m.h, m.d, m.swell, 6), concrete, m.x, m.y + m.h / 2, m.z)
    const stories = Math.max(1, m.rows)
    for (let r = 0; r < stories; r++) {
      const y = m.y + (r + 0.5) * (m.h / stories)
      const v = (y - (m.y + m.h / 2)) / (m.h / 2)
      for (const [axis, span, depth] of [
        ['x', m.w, m.d],
        ['z', m.d, m.w],
      ] as const) {
        for (let o = -span / 2 + 1.5; o <= span / 2 - 1.5; o += 2) {
          const out = pillowOut(depth / 2, m.swell, o / (span / 2), v) + 0.02
          for (const side of [-1, 1]) {
            const g = new THREE.BoxGeometry(
              axis === 'x' ? 0.35 : 0.14,
              2.2,
              axis === 'x' ? 0.14 : 0.35
            )
            const x = axis === 'x' ? m.x + o : m.x + side * out
            const z = axis === 'x' ? m.z + side * out : m.z + o
            add(g, slit, x, y, z)
          }
        }
      }
    }
    if (rng() < 0.4) {
      const side = rng() < 0.5 ? -1 : 1
      const out = pillowOut(m.w / 2, m.swell, 0, 0) + 0.4
      const x = m.x + side * out
      const z = m.z + range(rng, -m.d / 4, m.d / 4)
      strut(
        new THREE.Vector3(x, m.y, z),
        new THREE.Vector3(x, m.y + m.h, z),
        0.4,
        pipe
      )
    }
  }

  // The spomeniks' forms on the concrete roofs.
  for (const form of layout.forms) {
    onMass(form.on)
    into.add(buildForm(form, formConcrete, slit))
  }

  // The pinnacles at the stone roofs' corners.
  for (const p of layout.pinnacles) {
    onMass(p.on)
    add(new THREE.BoxGeometry(0.9, 1.6, 0.9), stone, p.x, p.y + 0.8, p.z)
    add(
      new THREE.ConeGeometry(0.5, p.h, 4),
      darkStone,
      p.x,
      p.y + 1.6 + p.h / 2,
      p.z,
      Math.PI / 4
    )
  }

  // The spires: an octagonal drum with its lancets, the cone, crockets up
  // its edges, a finial.
  for (const s of layout.spires) {
    onMass(s.on)
    const sides = 8
    add(
      new THREE.CylinderGeometry(
        s.radius * 1.05,
        s.radius * 1.2,
        s.drum,
        sides
      ),
      stone,
      s.x,
      s.y + s.drum / 2,
      s.z
    )
    for (let e = 0; e < sides; e += 2) {
      const turn = (e / sides) * Math.PI * 2 + Math.PI / sides
      const pane = new THREE.Mesh(lancet, glassOf())
      pane.position.set(
        s.x + Math.cos(turn) * s.radius * 1.12,
        s.y + s.drum * 0.25,
        s.z + Math.sin(turn) * s.radius * 1.12
      )
      pane.rotation.y = Math.PI / 2 - turn
      pane.scale.setScalar(Math.min(1, s.drum / 4))
      into.add(pane)
    }
    add(
      new THREE.ConeGeometry(s.radius, s.h, sides),
      darkStone,
      s.x,
      s.y + s.drum + s.h / 2,
      s.z
    )
    for (let e = 0; e < sides; e++) {
      const turn = (e / sides) * Math.PI * 2
      for (let c = 1; c <= s.crockets; c++) {
        const f = c / (s.crockets + 1)
        const r = s.radius * (1 - f) + 0.2
        add(
          new THREE.BoxGeometry(0.5, 0.25, 0.25),
          stone,
          s.x + Math.cos(turn) * r,
          s.y + s.drum + f * s.h,
          s.z + Math.sin(turn) * r,
          -turn
        )
      }
    }
    const tip = s.y + s.drum + s.h
    strut(
      new THREE.Vector3(s.x, tip, s.z),
      new THREE.Vector3(s.x, tip + 2.5, s.z),
      0.12,
      metal
    )
    strut(
      new THREE.Vector3(s.x - 0.7, tip + 1.7, s.z),
      new THREE.Vector3(s.x + 0.7, tip + 1.7, s.z),
      0.1,
      metal
    )
  }

  // The flying buttresses: an arc of stones from the low roof's edge up
  // to the tall mass's side, a pinnacle on the pier it springs from.
  for (const [index, b] of layout.buttresses.entries()) {
    into = buttressPieces[index].inner
    const from = new THREE.Vector3(b.from.x, b.from.y, b.from.z)
    const to = new THREE.Vector3(b.to.x, b.to.y, b.to.z)
    const lift = from.distanceTo(to) * 0.25
    const at = (t: number) => {
      const p = from.clone().lerp(to, t)
      p.y += Math.sin(t * Math.PI) * lift
      return p
    }
    const pieces = 8
    for (let i = 0; i < pieces; i++) {
      strut(at(i / pieces), at((i + 1) / pieces), 0.9, stone)
    }
    add(new THREE.BoxGeometry(1.6, 3, 1.6), stone, from.x, from.y + 1.5, from.z)
    add(
      new THREE.ConeGeometry(0.9, 4, 4),
      darkStone,
      from.x,
      from.y + 5,
      from.z,
      Math.PI / 4
    )
  }

  // The gargoyles: crouched, jutting out over the edge, mouths open.
  for (const g of layout.gargoyles) {
    onMass(g.on)
    const out = new THREE.Vector3(Math.cos(g.yaw), 0, Math.sin(g.yaw))
    const at = new THREE.Vector3(g.x, g.y, g.z).add(
      out.clone().multiplyScalar(0.6)
    )
    const rot = -g.yaw
    add(
      new THREE.BoxGeometry(1.4, 0.8, 0.8),
      stone,
      at.x,
      at.y + 0.4,
      at.z,
      rot
    )
    const head = at.clone().add(out.clone().multiplyScalar(0.9))
    add(
      new THREE.BoxGeometry(0.7, 0.6, 0.6),
      darkStone,
      head.x,
      head.y + 0.6,
      head.z,
      rot
    )
    for (const side of [-1, 1]) {
      const wing = new THREE.BoxGeometry(0.9, 0.08, 0.6)
      const across = new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(
        side * 0.6
      )
      const mesh = add(
        wing,
        darkStone,
        at.x + across.x,
        at.y + 1,
        at.z + across.z,
        rot
      )
      mesh.rotation.x = side * 0.6
    }
  }

  into = body

  // The lighthouse: a ribbed round tower, a gallery, the lantern room.
  const lh = layout.lighthouse
  add(
    new THREE.CylinderGeometry(lh.radius * 0.85, lh.radius, lh.h, 10),
    pale,
    lh.x,
    lh.y + lh.h / 2,
    lh.z
  )
  for (let i = 0; i < 10; i++) {
    const turn = (i / 10) * Math.PI * 2
    add(
      new THREE.BoxGeometry(0.35, lh.h, 0.35),
      concrete,
      lh.x + Math.cos(turn) * lh.radius * 0.95,
      lh.y + lh.h / 2,
      lh.z + Math.sin(turn) * lh.radius * 0.95
    )
  }
  const top = lh.y + lh.h
  add(
    new THREE.CylinderGeometry(lh.radius + 1, lh.radius + 1, 0.5, 12),
    metal,
    lh.x,
    top + 0.25,
    lh.z
  )
  add(
    new THREE.ConeGeometry(lh.radius * 0.9, 3, 10),
    darkStone,
    lh.x,
    top + 5.5,
    lh.z
  )

  castShadows(body)
  mergeStatic(body)

  // The lantern room and its lamp: no fog, so it shows across the valley.
  const { color, beamLength } = CONFIG.castle.lighthouse
  const blue = new THREE.Color(color)
  const lantern = new THREE.Mesh(
    new THREE.CylinderGeometry(lh.radius * 0.7, lh.radius * 0.7, 3.5, 10),
    new THREE.MeshBasicMaterial({ color: blue, fog: false })
  )
  lantern.position.set(lh.x, top + 2.25, lh.z)
  body.add(lantern)
  const glow = makeGlowTexture('rgba(90, 170, 255, 0.9)')
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
    })
  )
  halo.scale.setScalar(14)
  halo.position.copy(lantern.position)
  body.add(halo)
  // A point of it the same size on screen however far off: the lamp seen
  // from the other end of the valley.
  const star = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
      sizeAttenuation: false,
    })
  )
  star.scale.setScalar(0.035)
  star.position.copy(lantern.position)
  body.add(star)

  // The two beams, back to back, fading along their length.
  const beams = new THREE.Group()
  beams.position.copy(lantern.position)
  const beamGeo = new THREE.ConeGeometry(
    beamLength * 0.07,
    beamLength,
    16,
    8,
    true
  )
  beamGeo.translate(0, -beamLength / 2, 0)
  beamGeo.rotateZ(Math.PI / 2)
  const colors: number[] = []
  const pos = beamGeo.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const fade = Math.pow(1 - Math.min(1, pos.getX(i) / beamLength), 1.6)
    colors.push(blue.r * fade, blue.g * fade, blue.b * fade)
  }
  beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const beamMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  })
  for (const turn of [0, (Math.PI * 2) / 3, (Math.PI * 4) / 3]) {
    const beam = new THREE.Mesh(beamGeo, beamMat)
    beam.name = LIGHT_BEAM
    beam.rotation.y = turn
    // A little down, sweeping the valley floor.
    beam.rotation.z = -0.04
    beams.add(beam)
  }
  body.add(beams)

  // The bits always falling off it, and the chunks a crumbling piece
  // throws, each pool one instanced mesh, shrinking and darkening as they
  // fall (crumble.ts).
  const frag = CONFIG.castle.fragments
  const pieceStone = lambert({ color: '#ffffff' })
  const pool = (count: number) => {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      pieceStone,
      count
    )
    mesh.frustumCulled = false
    mesh.setColorAt(0, new THREE.Color())
    body.add(mesh)
    return mesh
  }
  const bits = pool(frag.count)
  const chunks = pool(frag.chunks * 4)
  const seed = seedOf(layout.day)
  const dummy = new THREE.Object3D()
  const shade = new THREE.Color()
  const fresh = new THREE.Color('#767472')
  const dark = new THREE.Color('#151413')
  const place = (mesh: THREE.InstancedMesh, i: number, f: Fragment | null) => {
    if (!f || f.fade >= 1) {
      dummy.scale.setScalar(0)
    } else {
      dummy.position.set(f.x, f.y, f.z)
      dummy.rotation.set(f.spin, f.spin * 0.7, f.spin * 0.3)
      dummy.scale.setScalar(f.size * (1 - f.fade * 0.6))
      mesh.setColorAt(i, shade.copy(fresh).lerp(dark, f.fade))
    }
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  // A buttress's chunks fall from the box round its arc.
  const boxOf = (b: CastleLayout['buttresses'][number]) => ({
    x: (b.from.x + b.to.x) / 2,
    z: (b.from.z + b.to.z) / 2,
    y: b.from.y,
    w: Math.abs(b.to.x - b.from.x) + 1,
    d: Math.abs(b.to.z - b.from.z) + 1,
    h: b.to.y - b.from.y + 2,
  })

  // A piece as its ruin has it: crumbling, it sags, leans and shrinks
  // into its foot; gone, hidden; regrowing, it rises back out of it.
  const pose = (pivot: THREE.Group, ruin: Ruin, lean: number) => {
    pivot.visible = ruin.stage !== 'gone'
    pivot.scale.set(1, 1, 1)
    pivot.rotation.set(0, 0, 0)
    pivot.position.y = (pivot.userData as { y: number }).y
    if (ruin.stage === 'crumbling') {
      const e = ruin.u * ruin.u
      pivot.scale.set(1 - 0.5 * e, 1 - 0.95 * e, 1 - 0.5 * e)
      pivot.rotation.set(lean * 0.3 * e, 0, -lean * 0.4 * e)
      pivot.position.y -= 3 * e
    } else if (ruin.stage === 'regrowing') {
      const e = 1 - (1 - ruin.u) * (1 - ruin.u)
      pivot.scale.set(0.6 + 0.4 * e, Math.max(0.01, e), 0.6 + 0.4 * e)
    }
  }
  for (const { pivot } of [...massPieces, ...buttressPieces]) {
    pivot.userData = { y: pivot.position.y }
  }

  const update = (t: number) => {
    body.position.y = bobAt(t)
    // Moat-local angle from +x toward +z; three turns +y the other way.
    beams.rotation.y = -lighthouseAngle(t)
    const ruins = ruinsAt(layout, t)
    ruins.masses.forEach((ruin, i) =>
      pose(massPieces[i].pivot, ruin, i % 2 === 0 ? 1 : -1)
    )
    ruins.buttresses.forEach((ruin, i) =>
      pose(buttressPieces[i].pivot, ruin, i % 2 === 0 ? -1 : 1)
    )
    for (let i = 0; i < frag.count; i++) {
      place(bits, i, fragmentAt(layout, ruins, i, t))
    }
    // The chunks of whatever is crumbling now, as many as the pool holds.
    let slot = 0
    const throwOff = (
      box: Parameters<typeof chunkAt>[0],
      ruin: Ruin,
      key: number
    ) => {
      if (ruin.stage === 'standing' || ruin.stage === 'regrowing') return
      for (let j = 0; j < frag.chunks && slot < chunks.count; j++) {
        const f = chunkAt(box, seed + key, ruin.round, j, ruin.since)
        if (f) place(chunks, slot++, f)
      }
    }
    ruins.masses.forEach((ruin, i) => throwOff(layout.masses[i], ruin, i))
    ruins.buttresses.forEach((ruin, i) =>
      throwOff(boxOf(layout.buttresses[i]), ruin, 1000 + i)
    )
    while (slot < chunks.count) place(chunks, slot++, null)
    bits.instanceMatrix.needsUpdate = true
    chunks.instanceMatrix.needsUpdate = true
    if (bits.instanceColor) bits.instanceColor.needsUpdate = true
    if (chunks.instanceColor) chunks.instanceColor.needsUpdate = true
  }
  update(0)
  setMotion(group, update)

  const dispose = () => {
    // Sprites share one geometry among them all; keep it.
    halo.material.dispose()
    star.material.dispose()
    group.traverse((node) => {
      if (isMesh(node)) {
        node.geometry.dispose()
        const materials = Array.isArray(node.material)
          ? node.material
          : [node.material]
        // The concrete and glow maps are shared and kept.
        for (const material of materials) material.dispose()
      }
    })
  }
  return { group, update, dispose }
}
