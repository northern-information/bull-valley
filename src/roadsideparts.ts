import * as THREE from 'three'
import { lambert, makeGlowSprite, makeGlowTexture } from './assetkit.ts'
import { applyPS1 } from './ps1.ts'
import type { Part } from './assetkit.ts'
import type { Vec3 } from './interfaces.ts'

// What stands along the roads and over the fields (roadside.ts, world.ts):
// the trees, the utility poles and their wire, the sodium streetlights,
// the reeds, the graveyard stones and the landmark beacons. Instanced
// parts in asset-local space; the Akashic samples are akashicassets.ts.

// --- Trees ---------------------------------------------------------------

// Unit-height trunk and canopy, scaled per instance. TREE_SAMPLE is a
// mid-range instance for the Akashic page.
export const TREE_CANOPY_LOW = '#1c2f1e'
export const TREE_CANOPY_HIGH = '#31482a'
export const TREE_SAMPLE = { trunkH: 3.2, canopyH: 6, canopyR: 2.25, tint: 0.5 }

export function treeParts() {
  const trunk = new THREE.CylinderGeometry(0.15, 0.3, 1, 5)
  trunk.translate(0, 0.5, 0)
  const canopy = new THREE.ConeGeometry(1, 1, 6)
  canopy.translate(0, 0.5, 0)
  return {
    trunk: {
      name: 'trunk',
      geometry: trunk,
      material: lambert({ color: '#33271a' }),
    },
    // White base: each instance carries its own tint via instanceColor.
    canopy: {
      name: 'canopy',
      geometry: canopy,
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
