import * as THREE from 'three'
import { CITGO_RED } from './assets.ts'

// The glow around whatever E would act on: a pickup, the shelf unit a buy
// takes, the berry bush. The target draws alone, with its own materials
// (so the PS1 snap matches the mesh), into a mask; a fullscreen pass then
// rings the mask's silhouette in Citgo red over the frame. No depth from
// the world reaches the mask, so the ring shows through what stands in
// front of the target. Prefers-reduced-motion holds the pulse still.

// Reserved for the glow: only the target's meshes and the scene's lights
// sit on it. The lights ride along so the mask pass sees the same light
// set as the frame, or Three would rebuild every lit material's program
// state twice a frame.
export const GLOW_LAYER = 1

// The ring's reach in internal pixels: the inner ring full, the outer one
// fainter, stepped rather than smooth.
const RADIUS = 2

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec2 uTexel;
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    if (texture2D(uMask, vUv).a > 0.0) discard;
    float best = 99.0;
    for (int y = -${RADIUS}; y <= ${RADIUS}; y++) {
      for (int x = -${RADIUS}; x <= ${RADIUS}; x++) {
        vec2 o = vec2(float(x), float(y));
        if (texture2D(uMask, vUv + o * uTexel).a > 0.0) {
          best = min(best, length(o));
        }
      }
    }
    if (best > ${RADIUS}.5) discard;
    float k = best < 1.5 ? 1.0 : 0.4;
    gl_FragColor = vec4(uColor * k * uStrength, 1.0);
    #include <colorspace_fragment>
  }
`

export interface Glow {
  // The object to ring, or null for none. Sprites in it (the pickup halo)
  // stay out of the mask.
  setTarget(target: THREE.Object3D | null): void
  readonly target: THREE.Object3D | null
  // The renderer's drawing-buffer size, after every resize.
  setSize(width: number, height: number): void
  // Draw the ring over the frame just rendered; a no-op without a target.
  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void
}

export function createGlow(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  still: boolean
): Glow {
  scene.traverse((o) => {
    if (o instanceof THREE.Light) o.layers.enable(GLOW_LAYER)
  })

  const mask = new THREE.WebGLRenderTarget(2, 2, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  })
  const texel = new THREE.Vector2(0.5, 0.5)
  const strength = { value: 1 }
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMask: { value: mask.texture },
      uTexel: { value: texel },
      uColor: { value: new THREE.Color(CITGO_RED) },
      uStrength: strength,
    },
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  })
  // One triangle over the whole screen.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  )
  const quad = new THREE.Mesh(geometry, material)
  quad.frustumCulled = false
  const overlay = new THREE.Scene()
  overlay.add(quad)
  const overlayCamera = new THREE.OrthographicCamera()

  const meshesOf = (target: THREE.Object3D) => {
    const meshes: THREE.Object3D[] = []
    target.traverse((o) => {
      if (o instanceof THREE.Mesh) meshes.push(o)
    })
    return meshes
  }

  let target: THREE.Object3D | null = null
  const clear = new THREE.Color()

  return {
    get target() {
      return target
    },
    setTarget(next) {
      if (next === target) return
      if (target) for (const m of meshesOf(target)) m.layers.disable(GLOW_LAYER)
      target = next
      if (target) for (const m of meshesOf(target)) m.layers.enable(GLOW_LAYER)
    },
    setSize(width, height) {
      mask.setSize(width, height)
      texel.set(1 / width, 1 / height)
    },
    render(world, camera, time) {
      if (!target || !target.visible) return
      // The mask: the target alone, on a clear background, no shadow pass.
      const layers = camera.layers.mask
      const background = world.background
      const shadows = renderer.shadowMap.autoUpdate
      const autoClear = renderer.autoClear
      renderer.getClearColor(clear)
      const clearAlpha = renderer.getClearAlpha()
      camera.layers.set(GLOW_LAYER)
      world.background = null
      renderer.shadowMap.autoUpdate = false
      renderer.setRenderTarget(mask)
      renderer.setClearColor(0x000000, 0)
      renderer.clear()
      renderer.autoClear = false
      renderer.render(world, camera)
      camera.layers.mask = layers
      world.background = background
      renderer.shadowMap.autoUpdate = shadows
      renderer.setClearColor(clear, clearAlpha)
      // The ring, added over the frame.
      strength.value = still ? 0.9 : 0.75 + Math.sin(time * 4) * 0.25
      renderer.setRenderTarget(null)
      renderer.render(overlay, overlayCamera)
      renderer.autoClear = autoClear
    },
  }
}
