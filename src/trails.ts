import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { isClear } from './wardview.ts'
import type { WardView } from './wardview.ts'

// The view through the wards (wardview.ts): sober, the frame draws straight
// to the screen. Otherwise it draws into a target, and one pass blurs it as
// a use starts (trip.ts), sharpens it for the stimulated, saturates it for
// the high, and lays it over what the last frame left (each frame keeping
// some of the one before, so anything that moves, the view included,
// smears behind itself, as the drunk see it). The result is copied to the
// screen and kept for the next frame. The glow draws over it after, crisp.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = position.xy * 0.5 + 0.5;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

// Linear in, linear out: the history stays linear until it is shown. The
// sharpen is an unsharp mask on the four neighbours `uReach` pixels off;
// the saturation pushes each colour from its own grey.
const blendShader = /* glsl */ `
  uniform sampler2D uFrame;
  uniform sampler2D uHistory;
  uniform vec2 uTexel;
  uniform float uBlur;
  uniform float uKeep;
  uniform float uSaturation;
  uniform float uSharpen;
  uniform float uReach;
  varying vec2 vUv;
  void main() {
    vec3 here = texture2D(uFrame, vUv).rgb;
    vec3 now = here;
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
    if (uSharpen > 0.0) {
      vec2 dx = vec2(uTexel.x * uReach, 0.0);
      vec2 dy = vec2(0.0, uTexel.y * uReach);
      vec3 around = texture2D(uFrame, vUv + dx).rgb
        + texture2D(uFrame, vUv - dx).rgb
        + texture2D(uFrame, vUv + dy).rgb
        + texture2D(uFrame, vUv - dy).rgb;
      now = max(now + uSharpen * (here - around * 0.25), 0.0);
    }
    float grey = dot(now, vec3(0.2126, 0.7152, 0.0722));
    now = max(mix(vec3(grey), now, uSaturation), 0.0);
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
  // Draw the frame to the screen, through the wards when they work on it.
  render(scene: THREE.Scene, camera: THREE.Camera, view: WardView): void
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
      uSaturation: { value: 1 },
      uSharpen: { value: 0 },
      uReach: { value: CONFIG.wardView.sharpenRadius },
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

  // Whether the last frame went through the pass: the first one after a
  // sober frame has no history worth keeping.
  let passing = false

  return {
    setSize(width, height) {
      for (const t of [frame, history, next]) t.setSize(width, height)
      texel.set(1 / width, 1 / height)
      passing = false
    },
    render(scene, camera, view) {
      if (isClear(view)) {
        passing = false
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
        return
      }
      renderer.setRenderTarget(frame)
      renderer.render(scene, camera)

      const u = blend.uniforms
      u.uHistory.value = history.texture
      u.uBlur.value = view.blur
      u.uKeep.value = passing ? view.keep : 0
      u.uSaturation.value = view.saturation
      u.uSharpen.value = view.sharpen
      u.uReach.value = CONFIG.wardView.sharpenRadius
      quad.material = blend
      renderer.setRenderTarget(next)
      renderer.render(pass, passCamera)

      show.uniforms.uImage.value = next.texture
      quad.material = show
      renderer.setRenderTarget(null)
      renderer.render(pass, passCamera)

      ;[history, next] = [next, history]
      passing = true
    },
  }
}
