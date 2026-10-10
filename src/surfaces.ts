import * as THREE from 'three'
import { artTexture, lambert } from './assetkit.ts'
import { FUEL_LAYOUT } from './citgo.ts'
import { paintMud } from './mudart.ts'
import type { CanvasArt } from './canvas.ts'

// --- World surfaces ------------------------------------------------------

// world.ts builds these meshes from geo.json; the materials live here. Each
// call returns a new material.

// The roads (and the streams): lit, so the headlights and the station
// lights fall on them and what stands in a beam throws a shadow down the
// road. The emissive is each vertex's own tone, which keeps a road as dark
// as it was unlit, at the lot's strength (lotMaterial) so the two meet.
export function roadMaterial(): THREE.MeshLambertMaterial {
  const material = lambert({
    vertexColors: true,
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  })
  const ps1 = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    ps1(shader, renderer)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= vColor.rgb;'
    )
  }
  material.customProgramCacheKey = () => 'road-vertex-emissive'
  return material
}

// Worn mud (mudart.ts): every road's shoulders and the trail out of the
// corn maze by default, or other mud art, like the maze's own trail. Lit,
// and glowing through its own art at the roads' strength, so the two read
// as one at night. The default art repeats along the mud (v) and frays at
// both edges (u); see-through art shows the grass through alphaTest.
export function mudMaterial(
  art: CanvasArt = paintMud()
): THREE.MeshLambertMaterial {
  const texture = artTexture(art)
  texture.wrapT = THREE.RepeatWrapping
  return lambert({
    map: texture,
    alphaTest: 0.5,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: texture,
    emissiveIntensity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  })
}

// The station lots, lit like the roads, so the canopy light falls on the
// forecourt and the pumps throw shadows across it. The night light barely
// reaches asphalt this dark, so the emissive carries the lot's own color
// at the roads' strength, and the two meet.
export function lotMaterial(): THREE.MeshLambertMaterial {
  return lambert({
    vertexColors: true,
    emissive: new THREE.Color(FUEL_LAYOUT.lotColor),
    emissiveIntensity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    side: THREE.DoubleSide,
  })
}

export function waterMaterial(): THREE.MeshLambertMaterial {
  return lambert({
    vertexColors: true,
    emissive: new THREE.Color('#03121f'),
    side: THREE.DoubleSide,
  })
}

// The faint fence line at a property edge.
export function fenceMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: '#3a3f47',
    transparent: true,
    opacity: 0.4,
  })
}

// The amber line round the survey boundary.
export function boundaryMaterial(): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color: '#f59e0b',
    transparent: true,
    opacity: 0.45,
  })
}
