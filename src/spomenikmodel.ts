import * as THREE from 'three'
import type { Form } from './castle.ts'

// The concrete of Castle Entropy gone strange, after the Yugoslav
// spomeniks: a box swollen like a pillow (`pillowBox`, every face bulging
// out of its edges), and the forms that stand on its concrete roofs
// (`buildForm`, castle.ts `Form`), poured as Villeneuve might have: a
// monolith, a sheer slab leaning off true with grooves cut across it and
// a lower twin behind, like a wall of Arrakeen; a star of fins like
// Kosmaj's spikes; a wing of concrete cantilevered like Podgarić's; a
// faceted boulder split down the middle like Tjentište's. Each is built
// about its own foot, in metres, hard-edged for the PS1 look.

// A `w` by `h` by `d` box whose faces swell out by `swell` (a share of
// each half-size) in their middles and not at all at their edges, the
// roof a little domed. Its uvs run in metres over `panel`, as a slab's do.
export function pillowBox(
  w: number,
  h: number,
  d: number,
  swell: number,
  panel: number
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d, 6, 8, 6)
  const pos = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  const normal = geometry.getAttribute('normal')
  for (let i = 0; i < pos.count; i++) {
    const nx = pos.getX(i) / (w / 2)
    const ny = pos.getY(i) / (h / 2)
    const nz = pos.getZ(i) / (d / 2)
    // Each axis pushed out by how far the point lies from the other two
    // axes' edges; the floor stays flat, so it sits on what is under it.
    const sx = 1 + swell * (1 - ny * ny) * (1 - nz * nz)
    const sz = 1 + swell * (1 - ny * ny) * (1 - nx * nx)
    const sy = ny > 0 ? 1 + swell * 0.35 * (1 - nx * nx) * (1 - nz * nz) : 1
    pos.setXYZ(i, pos.getX(i) * sx, pos.getY(i) * sy, pos.getZ(i) * sz)
    const across = Math.abs(normal.getX(i)) > 0.5 ? d : w
    const up = Math.abs(normal.getY(i)) > 0.5 ? d : h
    uv.setXY(i, (uv.getX(i) * across) / panel, (uv.getY(i) * up) / panel)
  }
  geometry.computeVertexNormals()
  return geometry
}

// Where a pillow box's face stands out from its middle at a point on it:
// the half-size `half` across the face's axis, swollen at (u, v), each the
// point's share of the way to the face's edges, -1 to 1.
export function pillowOut(
  half: number,
  swell: number,
  u: number,
  v: number
): number {
  return half * (1 + swell * (1 - u * u) * (1 - v * v))
}

// One spomenik's form, about its foot.
// `shadow` is what a groove's depth looks like: near black.
export function buildForm(
  form: Form,
  concrete: THREE.Material,
  shadow: THREE.Material
): THREE.Group {
  const group = new THREE.Group()
  group.name = `spomenik-${form.kind}`
  group.position.set(form.x, form.y, form.z)
  switch (form.kind) {
    case 'monolith':
      monolith(group, form, concrete, shadow)
      break
    case 'fins':
      fins(group, form, concrete)
      break
    case 'wing':
      wing(group, form, concrete)
      break
    case 'split':
      split(group, form, concrete)
      break
  }
  return group
}

// A sheer slab leaning off true on a low plinth, its face cut across by
// deep grooves and its top sheared off at an angle, a lower twin standing
// behind it at a step's remove, the two like the walls of something too
// big to see whole.
function monolith(
  group: THREE.Group,
  form: Extract<Form, { kind: 'monolith' }>,
  concrete: THREE.Material,
  shadow: THREE.Material
): void {
  const turn = new THREE.Group()
  turn.rotation.y = form.yaw
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(form.w + 2, 0.8, form.depth * 3 + 2),
    concrete
  )
  plinth.position.y = 0.4
  turn.add(plinth)
  const slab = (w: number, h: number, z: number, lean: number) => {
    // The sheared top: one corner higher than the other.
    const shape = new THREE.Shape([
      new THREE.Vector2(-w / 2, 0),
      new THREE.Vector2(w / 2, 0),
      new THREE.Vector2(w / 2, h * 0.86),
      new THREE.Vector2(-w / 2, h),
    ])
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: form.depth,
      bevelEnabled: false,
    })
    geometry.translate(0, 0, -form.depth / 2)
    const pivot = new THREE.Group()
    pivot.position.set(0, 0.8, z)
    pivot.rotation.x = lean
    pivot.add(new THREE.Mesh(geometry, concrete))
    // The grooves, dark and deep across both faces.
    for (let g = 1; g <= form.grooves; g++) {
      const y = (g / (form.grooves + 1)) * h * 0.82
      for (const side of [-1, 1]) {
        const groove = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.92, 0.12, 0.08),
          shadow
        )
        groove.position.set(0, y, (side * form.depth) / 2)
        pivot.add(groove)
      }
    }
    turn.add(pivot)
  }
  slab(form.w, form.h, 0, form.lean)
  slab(form.w * 0.7, form.h * 0.62, -form.depth * 1.8, form.lean * 0.5)
  group.add(turn)
}

// A star of fins standing round a core, each a spike rising from its outer
// foot to a point over the middle, twisted a little out of true.
function fins(
  group: THREE.Group,
  form: Extract<Form, { kind: 'fins' }>,
  concrete: THREE.Material
): void {
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(form.reach, 0),
    new THREE.Vector2(form.reach * 0.35, form.h * 0.45),
    new THREE.Vector2(0.5, form.h),
    new THREE.Vector2(0, form.h),
  ])
  const fin = new THREE.ExtrudeGeometry(shape, {
    depth: 0.8,
    bevelEnabled: false,
  })
  fin.translate(0, 0, -0.4)
  for (let i = 0; i < form.count; i++) {
    const mesh = new THREE.Mesh(fin, concrete)
    mesh.rotation.y = (i / form.count) * Math.PI * 2
    mesh.rotation.x = form.twist * (i % 2 === 0 ? 1 : -1) * 0.3
    group.add(mesh)
  }
  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 1.4, form.h * 0.9, 8),
    concrete
  )
  core.position.y = form.h * 0.45
  group.add(core)
}

// A crescent of concrete stood on edge and leaned out, cantilevered off a
// pier under its middle.
function wing(
  group: THREE.Group,
  form: Extract<Form, { kind: 'wing' }>,
  concrete: THREE.Material
): void {
  const outer = form.span / 2
  const inner = outer * 0.72
  const points: THREE.Vector2[] = []
  const steps = 10
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI
    points.push(new THREE.Vector2(Math.cos(a) * outer, Math.sin(a) * outer))
  }
  for (let i = steps; i >= 0; i--) {
    const a = (i / steps) * Math.PI
    points.push(
      new THREE.Vector2(Math.cos(a) * inner, Math.sin(a) * inner + outer * 0.18)
    )
  }
  const crescent = new THREE.ExtrudeGeometry(new THREE.Shape(points), {
    depth: 1.4,
    bevelEnabled: false,
  })
  // One end on the pier, the rest thrown out over nothing.
  crescent.translate(-outer + 0.7, 0, -0.7)
  const blade = new THREE.Mesh(crescent, concrete)
  blade.position.y = 3
  blade.rotation.x = form.tilt
  const turn = new THREE.Group()
  turn.rotation.y = form.yaw
  turn.add(blade)
  const pier = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 1.4), concrete)
  pier.position.y = 1.7
  turn.add(pier)
  group.add(turn)
}

// A boulder split down the middle, its halves leaning apart: each half a
// faceted block, flat on the cut, broad at the shoulder and sheared to a
// blunt point.
function split(
  group: THREE.Group,
  form: Extract<Form, { kind: 'split' }>,
  concrete: THREE.Material
): void {
  const r = form.radius
  const shape = new THREE.Shape([
    new THREE.Vector2(0, 0),
    new THREE.Vector2(r * 0.9, 0),
    new THREE.Vector2(r * 1.15, form.h * 0.38),
    new THREE.Vector2(r * 0.75, form.h * 0.82),
    new THREE.Vector2(0.2, form.h),
    new THREE.Vector2(0, form.h * 0.96),
  ])
  const half = new THREE.ExtrudeGeometry(shape, {
    depth: r * 1.6,
    bevelEnabled: false,
  })
  half.translate(0, 0, -r * 0.8)
  const turn = new THREE.Group()
  turn.rotation.y = form.yaw
  for (const side of [-1, 1]) {
    const mesh = new THREE.Mesh(half, concrete)
    mesh.scale.x = side
    mesh.position.x = (side * form.gap) / 2
    mesh.rotation.z = -side * 0.12
    turn.add(mesh)
  }
  group.add(turn)
}
