// The fog wall across the deep chamber's door as seen (fogwall.ts): a
// sheet of pale fog hung in the doorway, lit by nothing, its billows
// climbing slowly through it and its edges fraying into the stone, stepped
// as the rest of the valley is. Three layers a hand apart give it depth
// from an angle. It comes up as the Warden stands and thins away to
// nothing once it bursts (set), over a second or so.

import * as THREE from 'three'

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    // It breathes in and out of the door, never quite still.
    p.z += sin(uv.y * 5.0 + uTime * 0.9 + uv.x * 3.0) * 0.06;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uSeed;
  uniform float uShow;
  uniform vec3 uColor;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(uSeed, 1.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Coarse texels, as the valley's textures are.
    vec2 uv = floor(vUv * vec2(48.0, 64.0)) / vec2(48.0, 64.0);
    float t = uTime;
    // The billows climb, and a slower drift turns them across.
    vec2 q = vec2(uv.x * 2.4 + uSeed, uv.y * 3.2 - t * 0.22);
    vec2 warp = vec2(fbm(q + vec2(t * 0.05, 0.0)), fbm(q + vec2(5.2, t * 0.04)));
    float f = fbm(q + warp * 1.6);
    // Thin at the stone either side and at the lintel, thick at the floor;
    // the billows wisp through a veil you can almost see past.
    float edge = smoothstep(0.0, 0.22, uv.x) * smoothstep(1.0, 0.78, uv.x);
    float top = smoothstep(1.0, 0.62, uv.y);
    float wisp = smoothstep(0.35, 0.85, f);
    float body = 0.22 + 0.78 * wisp;
    float a = body * edge * top * (0.5 + 0.3 * (1.0 - uv.y)) * uShow;
    // Stepped, the way the PS1 dithered its fades.
    a = floor(a * 7.0 + 0.5) / 7.0;
    vec3 c = mix(uColor * 0.55, uColor * 1.1, wisp);
    gl_FragColor = vec4(c, a);
  }
`

export interface FogWallRig {
  group: THREE.Group
  // Whether the Warden stands: the fog comes up, or thins away.
  set(standing: boolean): void
  update(t: number): void
}

// How long it takes to come up or thin away, in seconds.
const FADE = 1.4

// A fog wall `width` across and `height` high, its middle at the origin's
// floor, spanning the local x axis.
export function buildFogWall(width: number, height: number): FogWallRig {
  const group = new THREE.Group()
  group.name = 'fog-wall'
  const time = { value: 0 }
  const show = { value: 0 }
  const geometry = new THREE.PlaneGeometry(width, height, 6, 8)
  geometry.translate(0, height / 2, 0)
  for (const [i, z] of [-0.18, 0, 0.18].entries()) {
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: time,
        uShow: show,
        uSeed: { value: i * 3.1 },
        uColor: { value: new THREE.Color('#d6dbe0') },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.z = z
    mesh.renderOrder = 3
    group.add(mesh)
  }
  group.visible = false
  let want = 0
  let last = 0
  return {
    group,
    set(standing) {
      want = standing ? 1 : 0
    },
    update(t) {
      const dt = Math.min(0.1, Math.max(0, t - last))
      last = t
      time.value = t
      const step = dt / FADE
      show.value =
        want > show.value
          ? Math.min(want, show.value + step)
          : Math.max(want, show.value - step)
      group.visible = show.value > 0
    },
  }
}
