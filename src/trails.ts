import * as THREE from 'three'
import { CONFIG } from './config.ts'
import type { TripLevel } from './trip.ts'

// The view on a trip (trip.ts): sober, the frame draws straight to the
// screen. Otherwise it draws into a target, a pass blurs it as the trip
// starts and lays it over what the last frame left (each frame keeping
// CONFIG.trip.persistence of the one before, so anything that moves, the
// view included, smears behind itself), and the result is copied to the
// screen and kept for the next frame. The glow draws over it after, crisp.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Linear in, linear out: the history stays linear until it is shown.
const blendShader = /* glsl */ `
  uniform sampler2D uFrame;
  uniform sampler2D uHistory;
  uniform vec2 uTexel;
  uniform float uBlur;
  uniform float uKeep;
  varying vec2 vUv;
  void main() {
    vec3 now = texture2D(uFrame, vUv).rgb;
    if (uBlur > 0.0) {
      vec3 sum = vec3(0.0);
      float weight = 0.0;
      for (int y = -2; y <= 2; y++) {
        for (int x = -2; x <= 2; x++) {
          vec2 o = vec2(float(x), float(y));
          float k = 1.0 / (1.0 + dot(o, o));
          sum += texture2D(uFrame, vUv + o * 0.5 * uBlur * uTexel).rgb * k;
          weight += k;
        }
      }
      now = sum / weight;
    }
    vec3 before = texture2D(uHistory, vUv).rgb;
    gl_FragColor = vec4(mix(now, before, uKeep), 1.0);
  }
`

const showShader = /* glsl */ `
  uniform sampler2D uImage;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uImage, vUv).rgb, 1.0);
    #include <colorspace_fragment>
  }
`

export interface Trails {
  // The renderer's drawing-buffer size, after every resize.
  setSize(width: number, height: number): void
  // Draw the frame to the screen, through the trip when there is one.
  render(scene: THREE.Scene, camera: THREE.Camera, level: TripLevel): void
}

export function createTrails(renderer: THREE.WebGLRenderer): Trails {
  const target = (depth: boolean) =>
    new THREE.WebGLRenderTarget(2, 2, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      type: THREE.HalfFloatType,
      depthBuffer: depth,
      stencilBuffer: depth,
    })
  const frame = target(true)
  let history = target(false)
  let next = target(false)

  const texel = new THREE.Vector2(0.5, 0.5)
  const blend = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: blendShader,
    uniforms: {
      uFrame: { value: frame.texture },
      uHistory: { value: history.texture },
      uTexel: { value: texel },
      uBlur: { value: 0 },
      uKeep: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
  })
  const show = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader: showShader,
    uniforms: { uImage: { value: next.texture } },
    depthTest: false,
    depthWrite: false,
  })
  // One triangle over the whole screen.
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)
  )
  const quad = new THREE.Mesh(geometry, blend)
  quad.frustumCulled = false
  const pass = new THREE.Scene()
  pass.add(quad)
  const passCamera = new THREE.OrthographicCamera()

  // Whether the last frame went through the trip: the first one after a
  // sober frame has no history worth keeping.
  let tripping = false

  return {
    setSize(width, height) {
      for (const t of [frame, history, next]) t.setSize(width, height)
      texel.set(1 / width, 1 / height)
      tripping = false
    },
    render(scene, camera, { blur, trails }) {
      if (blur <= 0 && trails <= 0) {
        tripping = false
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
        return
      }
      const { blurRadius, persistence } = CONFIG.trip
      renderer.setRenderTarget(frame)
      renderer.render(scene, camera)

      blend.uniforms.uHistory.value = history.texture
      blend.uniforms.uBlur.value = blur * blurRadius
      blend.uniforms.uKeep.value = tripping ? persistence * trails : 0
      quad.material = blend
      renderer.setRenderTarget(next)
      renderer.render(pass, passCamera)

      show.uniforms.uImage.value = next.texture
      quad.material = show
      renderer.setRenderTarget(null)
      renderer.render(pass, passCamera)

      ;[history, next] = [next, history]
      tripping = true
    },
  }
}
