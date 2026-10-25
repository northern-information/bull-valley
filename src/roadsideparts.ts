import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { lambert, makeGlowSprite, makeGlowTexture } from './assetkit.ts'
import { applyPS1 } from './ps1.ts'
import type { Part } from './assetkit.ts'
import type { Vec3 } from './interfaces.ts'

// What stands along the roads and over the fields (roadside.ts, world.ts):
// the trees, the utility poles and their wire, the sodium streetlights,
// the reeds, the graveyard stones and the landmark beacons. Instanced
// parts in asset-local space; the Akashic samples are akashicassets.ts.

// --- Trees ---------------------------------------------------------------

// The kinds of tree in the woods. Each draws as a unit-height trunk and a
// canopy fitted to unit height and unit radius, scaled per instance; its
// TreeForm turns a scatter tree's drawn sizes (buildTrees) into its own
// habit. TREE_SAMPLE is a mid-range instance for the Akashic page.
export const TREE_SPECIES = [
  'whiteOak',
  'hickory',
  'ash',
  'elm',
  'spruce',
  'pine',
] as const
export type TreeSpecies = (typeof TREE_SPECIES)[number]

export interface TreeForm {
  // Multipliers on the drawn trunk height, canopy height and canopy radius.
  trunk: number
  height: number
  radius: number
  // Where the canopy's foot sits up the trunk, as a share of its height.
  seat: number
  // The trunk's radius at its top and at its foot, per metre of trunk.
  girth: [top: number, foot: number]
  bark: string
  // Each instance's canopy lerps between these by its tint.
  low: string
  high: string
}

export const TREE_FORMS: Record<TreeSpecies, TreeForm> = {
  // Short and stout, the crown spreading wider than it stands tall.
  whiteOak: {
    trunk: 0.75,
    height: 0.75,
    radius: 1.9,
    seat: 0.8,
    girth: [0.22, 0.42],
    bark: '#5a5247',
    low: '#22331c',
    high: '#3a4a26',
  },
  // A tall straight bole under a narrow oblong crown, shagbark grey.
  hickory: {
    trunk: 1.3,
    height: 1.15,
    radius: 0.85,
    seat: 0.85,
    girth: [0.12, 0.24],
    bark: '#4c473f',
    low: '#26361a',
    high: '#404f22',
  },
  // An open oval crown in loose clumps, the palest green in the woods.
  ash: {
    trunk: 1.1,
    height: 0.95,
    radius: 1.2,
    seat: 0.8,
    girth: [0.13, 0.26],
    bark: '#514b42',
    low: '#2a3a20',
    high: '#45542c',
  },
  // The vase: limbs flaring out from low on the trunk to an arching top.
  elm: {
    trunk: 1.2,
    height: 1,
    radius: 1.5,
    seat: 0.55,
    girth: [0.15, 0.3],
    bark: '#3d3229',
    low: '#1f3220',
    high: '#35492b',
  },
  // Dark blue-green tiers from near the ground, the tallest in the woods.
  spruce: {
    trunk: 0.5,
    height: 1.6,
    radius: 0.9,
    seat: 0.4,
    girth: [0.12, 0.28],
    bark: '#3a2a1e',
    low: '#142420',
    high: '#22382f',
  },
  // The woods' first tree, and the lone pine among the dishes.
  pine: {
    trunk: 1,
    height: 1,
    radius: 1,
    seat: 0.8,
    girth: [0.15, 0.3],
    bark: '#33271a',
    low: '#1c2f1e',
    high: '#31482a',
  },
}

export const TREE_SAMPLE = { trunkH: 3.2, canopyH: 6, canopyR: 2.25, tint: 0.5 }

// Lobes merged into one canopy and fitted to unit height (foot at y = 0)
// and unit radius about the trunk, so every species scales alike.
function canopyOf(lobes: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(
    lobes.map((lobe) => (lobe.index ? lobe.toNonIndexed() : lobe))
  )
  geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox as THREE.Box3
  const r = Math.max(-min.x, max.x, -min.z, max.z)
  geometry.translate(0, -min.y, 0)
  geometry.scale(1 / r, 1 / (max.y - min.y), 1 / r)
  geometry.computeVertexNormals()
  return geometry
}

function lobe(
  geometry: THREE.BufferGeometry,
  [x, y, z]: Vec3,
  [sx, sy, sz]: Vec3
): THREE.BufferGeometry {
  return geometry.scale(sx, sy, sz).translate(x, y, z)
}

const CANOPIES: Record<TreeSpecies, () => THREE.BufferGeometry> = {
  whiteOak: () =>
    canopyOf([
      lobe(new THREE.IcosahedronGeometry(1, 0), [0, 0.7, 0], [1.1, 0.6, 1.1]),
      lobe(
        new THREE.IcosahedronGeometry(1, 0),
        [0.9, 0.45, 0.3],
        [0.7, 0.45, 0.7]
      ),
      lobe(
        new THREE.IcosahedronGeometry(1, 0),
        [-0.8, 0.5, -0.4],
        [0.7, 0.45, 0.7]
      ),
    ]),
  hickory: () =>
    canopyOf([new THREE.DodecahedronGeometry(1, 0).scale(0.8, 1, 0.8)]),
  ash: () =>
    canopyOf([
      lobe(new THREE.IcosahedronGeometry(1, 0), [0, 0.6, 0], [0.9, 0.7, 0.9]),
      lobe(
        new THREE.IcosahedronGeometry(1, 0),
        [0.3, 1.25, -0.2],
        [0.65, 0.5, 0.65]
      ),
    ]),
  elm: () =>
    canopyOf([
      new THREE.CylinderGeometry(1, 0.2, 1, 7, 1, true).translate(0, 0.5, 0),
      lobe(
        new THREE.IcosahedronGeometry(1, 0),
        [0, 1.05, 0],
        [1.15, 0.45, 1.15]
      ),
    ]),
  spruce: () =>
    canopyOf(
      [1, 0.75, 0.5].map((r, i) =>
        new THREE.ConeGeometry(r, 0.55, 7).translate(0, 0.275 + i * 0.32, 0)
      )
    ),
  pine: () => new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
}

export function treeParts(species: TreeSpecies = 'pine') {
  const { girth, bark } = TREE_FORMS[species]
  const trunk = new THREE.CylinderGeometry(girth[0], girth[1], 1, 5)
  trunk.translate(0, 0.5, 0)
  return {
    trunk: {
      name: 'trunk',
      geometry: trunk,
      material: lambert({ color: bark }),
    },
    // White base: each instance carries its own tint via instanceColor.
    canopy: {
      name: 'canopy',
      geometry: CANOPIES[species](),
      material: lambert({ color: '#ffffff' }),
    },
  }
}

// --- Utility poles -------------------------------------------------------

// Unit-height pole; the crossarm is placed POLE_ARM_DROP under the top,
// spanning local X, with an insulator at each POLE_INSULATOR_X along it.
// Local +X faces the road (roadside.ts turns local +Z along it).
export const POLE_SAMPLE = { height: 8.75 }
export const POLE_ARM_DROP = 0.9
export const POLE_INSULATOR_X = [-0.72, 0.72] as const
const POLE_ARM_HALF = 0.07
const POLE_INSULATOR_H = 0.14

// Where the wires hang on a pole of height h, in pole-local space: the top
// of each insulator, and the telephone cable lower down on the road side.
export function poleWireAnchors(h: number): Vec3[] {
  const top = h - POLE_ARM_DROP + POLE_ARM_HALF + POLE_INSULATOR_H
  return [...POLE_INSULATOR_X.map((x): Vec3 => [x, top, 0]), [0.17, h - 2.4, 0]]
}

export function poleParts() {
  const pole = new THREE.CylinderGeometry(0.12, 0.16, 1, 5)
  pole.translate(0, 0.5, 0)
  // Placed at the crossarm's centre, offset by POLE_INSULATOR_X.
  const insulator = new THREE.CylinderGeometry(0.035, 0.05, POLE_INSULATOR_H, 5)
  insulator.translate(0, POLE_ARM_HALF + POLE_INSULATOR_H / 2, 0)
  return {
    pole: {
      name: 'pole',
      geometry: pole,
      material: lambert({ color: '#3a2f22' }),
    },
    arm: {
      name: 'arm',
      geometry: new THREE.BoxGeometry(1.7, POLE_ARM_HALF * 2, 0.14),
      material: lambert({ color: '#33291d' }),
    },
    insulator: {
      name: 'insulator',
      geometry: insulator,
      material: lambert({ color: '#5d7a74' }),
    },
  }
}

// The wire strung between poles: unlit, near black against the night.
export function wireMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({ color: '#07090c' })
}

// How far a wire sags at mid-span, per metre of span.
export const WIRE_SAG = 0.025

// --- Streetlights --------------------------------------------------------

// High-pressure sodium: the warm orange that every county road junction
// in Illinois glowed in. The lens is unlit so it reads at any distance;
// world.ts adds the halo, the pool on the road, and the real lights.
export const SODIUM = '#ff9a3c'
export const SODIUM_HALO = 'rgba(255, 150, 60, 0.75)'

// A cobra-head streetlight in lamp-local space: the pole at the origin,
// the mast arm reaching out along +X to the head. `lens` is the centre of
// the lens's face, where the light comes from.
export const STREETLIGHT = {
  height: 8.6,
  reach: 4.2,
  lens: [4.35, 8.86, 0] as Vec3,
}

export function streetlightParts(): Part[] {
  const S = STREETLIGHT
  const steel = lambert({ color: '#61666d' })
  const pole = new THREE.CylinderGeometry(0.09, 0.15, S.height, 5)
  pole.translate(0, S.height / 2, 0)
  // The mast arm climbs a little as it reaches out.
  const rise = 0.35
  const armLength = Math.hypot(S.reach, rise)
  const arm = new THREE.BoxGeometry(armLength, 0.1, 0.1)
  arm.rotateZ(Math.atan2(rise, S.reach))
  arm.translate(S.reach / 2, S.height - 0.25 + rise / 2, 0)
  const head = new THREE.BoxGeometry(0.95, 0.22, 0.42)
  head.translate(S.lens[0], S.lens[1] + 0.13, 0)
  const lens = new THREE.BoxGeometry(0.72, 0.05, 0.3)
  lens.translate(S.lens[0], S.lens[1], 0)
  return [
    { name: 'streetlight-pole', geometry: pole, material: steel },
    { name: 'streetlight-arm', geometry: arm, material: steel },
    { name: 'streetlight-head', geometry: head, material: steel },
    {
      name: 'streetlight-lens',
      geometry: lens,
      material: applyPS1(new THREE.MeshBasicMaterial({ color: SODIUM })),
    },
  ]
}

// The halos over every lamp, as one cloud of points `size` metres across.
// A lamp shines through haze that hides the pole under it, so the halos
// take no fog; they shrink with distance instead.
export function sodiumHaloMaterial(size: number): THREE.PointsMaterial {
  return new THREE.PointsMaterial({
    map: makeGlowTexture(SODIUM_HALO),
    size,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  })
}

// The pools of light on the ground, coloured per vertex (alpha falls off
// to the rim). Draped over a road's crown, a pool can show two layers at
// once: the ground falling away past a road edge comes back into view
// behind it, and the two would add. The stencil lets a pixel take one
// layer of light a frame (ps1.ts gives the renderer a stencil buffer,
// cleared every frame). It writes no depth, so it never hides a foot.
export function sodiumPoolMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    stencilWrite: true,
    stencilRef: 1,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp,
  })
}

// --- Reeds ---------------------------------------------------------------

export function reedPart() {
  const geometry = new THREE.CylinderGeometry(0.02, 0.05, 1, 3)
  geometry.translate(0, 0.5, 0)
  return {
    name: 'reed',
    geometry,
    material: lambert({ color: '#2b301b' }),
  }
}

// --- Gravestones ---------------------------------------------------------

export function gravestonePart() {
  const geometry = new THREE.BoxGeometry(0.45, 0.85, 0.12)
  geometry.translate(0, 0.425, 0)
  return {
    name: 'gravestone',
    geometry,
    material: lambert({ color: '#454b54' }),
  }
}

// --- Landmark beacon -----------------------------------------------------

// A tall pole with a lit panel and a big glow, color-coded so it reads
// across the fog. Origin at ground level.
export function buildLandmarkBeacon(
  color: THREE.ColorRepresentation
): THREE.Group {
  const group = new THREE.Group()
  // The pole stops at the panel centre, and the panel is deeper than the
  // pole is wide, so the pole top stays hidden inside it.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.2, 9.4, 5),
    lambert({ color: '#20242a' })
  )
  pole.position.y = 4.7
  group.add(pole)
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 1.0, 0.36),
    lambert({
      color: '#101216',
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.9,
    })
  )
  panel.position.y = 9.4
  group.add(panel)
  const rgb = new THREE.Color(color)
  const sprite = makeGlowSprite(
    makeGlowTexture(
      `rgba(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)}, 0.55)`
    ),
    14
  )
  sprite.position.y = 9.4
  group.add(sprite)
  return group
}

// --- Waypoint pillar -----------------------------------------------------

// How tall a waypoint's pillar of light rises near to; further off it
// rises a share of the distance, so it always stands over the horizon.
export const WAYPOINT_PILLAR_HEIGHT = 140
const WAYPOINT_PILLAR_RISE = 0.12

// The pillar's column: a quad (x the side, -1 to 1; y the foot, 0, or the
// top, 1) turned to face the camera about its own upright, as wide as
// `uRadius` near to and never narrower on screen than `uHalfPx` pixels
// either side, so it holds a line through the PS1 downscale from any
// distance. Its depth is pinned inside the view so the far plane never
// clips it.
const PILLAR_VERTEX = `
uniform float uRadius;
uniform float uHalfPx;
uniform vec2 uRes;
uniform float uHeight;
uniform float uRise;
varying float vSide;
varying float vUp;
void main() {
  vec3 foot = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float dist = length(foot.xz - cameraPosition.xz);
  float height = max(uHeight, dist * uRise);
  vec4 clip = projectionMatrix * viewMatrix * vec4(foot.x, foot.y + position.y * height, foot.z, 1.0);
  float halfWidth = max(uRadius * projectionMatrix[0][0], uHalfPx * 2.0 / uRes.x * clip.w);
  clip.x += position.x * halfWidth;
  clip.z = 0.0;
  gl_Position = clip;
  vSide = position.x;
  vUp = position.y;
}
`

const PILLAR_FRAGMENT = `
uniform vec3 uColor;
uniform float uOpacity;
varying float vSide;
varying float vUp;
void main() {
  float across = 1.0 - abs(vSide);
  float alpha = uOpacity * across * (1.0 - 0.6 * vUp);
  gl_FragColor = vec4(uColor * alpha, 1.0);
}
`

// A waypoint (waypoints.ts) as it stands in the valley: a column of light,
// a bright core inside a wider haze, added over everything (no fog, no
// depth test, drawn last) so it cuts through the dark, the mist and the
// hills from anywhere in the valley. Only the raider who pinned it sees it,
// and it is meant to be found, so it is not hidden the way the valley
// hides things. Origin at ground level.
export function buildWaypointPillar(): THREE.Group {
  const group = new THREE.Group()
  const size = new THREE.Vector2()
  const layer = (radius: number, halfPx: number, opacity: number) => {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 0, 0, 1, 1, 0, -1, 1, 0],
        3
      )
    )
    const uniforms = {
      uRadius: { value: radius },
      uHalfPx: { value: halfPx },
      uRes: { value: new THREE.Vector2(1, 1) },
      uHeight: { value: WAYPOINT_PILLAR_HEIGHT },
      uRise: { value: WAYPOINT_PILLAR_RISE },
      uColor: { value: new THREE.Color('#f0ead6') },
      uOpacity: { value: opacity },
    }
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: PILLAR_VERTEX,
        fragmentShader: PILLAR_FRAGMENT,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    )
    // The shader places every vertex, so the bounds Three would cull by
    // are not where it draws.
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    mesh.onBeforeRender = (renderer) => {
      renderer.getDrawingBufferSize(size)
      uniforms.uRes.value.copy(size)
    }
    group.add(mesh)
  }
  layer(0.6, 3, 0.35)
  layer(0.15, 1, 1)
  return group
}
