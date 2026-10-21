import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { applyPS1 } from './ps1.ts'

// The Citgo bathroom's light: the laptop's screen and nothing else. Every
// face in the room (its tile, porcelain, linings, the card table, the
// laptop's shell) is drawn in a material that takes none of the scene's
// lights, not the moon, not the sky, not the back room's tube, not a
// flashlight, and is lit only by the screen: a soft blue that falls off
// across the room and is brightest in front of it. The laptop rides to the
// nearest Citgo with the shelf display (stationdisplay.ts), so the one
// glow does too; every other bathroom stands black. Done in the shader
// rather than with a Three light, so no light is added (the shaders never
// recompile) and none of it leaks through the walls into the back room.

const glow = {
  at: { value: new THREE.Vector3() },
  // The way the screen faces, unit length.
  face: { value: new THREE.Vector3(0, 0, -1) },
  level: { value: 0 },
  color: { value: new THREE.Color(CONFIG.laptop.glow.color) },
  reach: { value: CONFIG.laptop.glow.reach },
}

// Where the screen is and the way it faces, in the world, and how bright
// it is now (0 puts every bathroom out).
export function setBathGlow(
  at: THREE.Vector3,
  face: THREE.Vector3,
  level: number
): void {
  glow.at.value.copy(at)
  glow.face.value.copy(face).normalize()
  glow.level.value = level
}

const VERTEX = [
  '#include <project_vertex>',
  'vec4 bathP = vec4(transformed, 1.0);',
  '#ifdef USE_INSTANCING',
  'bathP = instanceMatrix * bathP;',
  '#endif',
  'vBathWorld = (modelMatrix * bathP).xyz;',
].join('\n')

// Flat shaded, as the period would: the face's normal from the screen-space
// slope of its world position. The sign of it is unknown, so both sides
// take the light; the walls hide the far side anyway.
const FRAGMENT = [
  'vec3 bathN = normalize(cross(dFdx(vBathWorld), dFdy(vBathWorld)));',
  'vec3 bathL = uBathAt - vBathWorld;',
  'float bathD = length(bathL);',
  'bathL /= max(bathD, 1e-4);',
  'float bathLam = abs(dot(bathN, bathL));',
  'float bathBeam = 0.3 + 0.7 * max(dot(uBathFace, -bathL), 0.0);',
  'float bathFall = 1.0 / (1.0 + bathD * bathD * 1.5);',
  'float bathFade = clamp(1.0 - bathD / uBathReach, 0.0, 1.0);',
  'vec3 bathLight = uBathColor * uBathLevel * bathFade *',
  '  (bathLam * bathBeam * bathFall + 0.05);',
  'vec3 outgoingLight = reflectedLight.indirectDiffuse * bathLight;',
].join('\n')

// A material for the bathroom: its colour (and its art, if any) lit by the
// screen alone, with the PS1 wobble and the scene's fog like any other.
export function bathLit(
  opts: THREE.MeshBasicMaterialParameters
): THREE.MeshBasicMaterial {
  const material = applyPS1(new THREE.MeshBasicMaterial(opts))
  const ps1 = material.onBeforeCompile.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    ps1(shader, renderer)
    shader.uniforms.uBathAt = glow.at
    shader.uniforms.uBathFace = glow.face
    shader.uniforms.uBathLevel = glow.level
    shader.uniforms.uBathColor = glow.color
    shader.uniforms.uBathReach = glow.reach
    shader.vertexShader =
      'varying vec3 vBathWorld;\n' +
      shader.vertexShader.replace('#include <project_vertex>', VERTEX)
    shader.fragmentShader =
      [
        'varying vec3 vBathWorld;',
        'uniform vec3 uBathAt;',
        'uniform vec3 uBathFace;',
        'uniform float uBathLevel;',
        'uniform vec3 uBathColor;',
        'uniform float uBathReach;',
      ].join('\n') +
      '\n' +
      shader.fragmentShader.replace(
        'vec3 outgoingLight = reflectedLight.indirectDiffuse;',
        FRAGMENT
      )
  }
  // One program for every bathroom material, apart from the base's own.
  material.customProgramCacheKey = () => 'bath-lit'
  return material
}
