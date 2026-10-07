// Black fog over the main menu's logo: a full-screen canvas with one
// fragment shader. fbm noise drifts sideways while slow bands of density
// roll across it, so the fog comes in waves, thickening over the logo and thinning off it.
// Drawn at the game's downscale with image-rendering: pixelated, so it has
// the same grain as the valley. Plain WebGL: Three would be a whole second
// renderer for one quad.

const VERTEX = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

const FRAGMENT = `
precision mediump float;
uniform vec2 uRes;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes.y;
  float t = uTime;
  // Two layers drifting against each other, one warping the other.
  float warp = fbm(uv * 1.6 + vec2(t * 0.03, -t * 0.02));
  float body = fbm(uv * 2.4 + vec2(-t * 0.06, 0.0) + warp * 1.8);
  // The waves: wide bands rolling left to right, bent by the noise.
  float wave = 0.5 + 0.5 * sin(uv.x * 2.2 - t * 0.55 + warp * 3.0);
  float density = smoothstep(0.38, 0.82, body * 0.75 + wave * 0.45);
  // Premultiplied black: only alpha carries the fog.
  gl_FragColor = vec4(0.0, 0.0, 0.0, density * 0.92);
}
`

export interface FogLayer {
  canvas: HTMLCanvasElement
  stop(): void
}

function compile(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('Logo fog shader failed:', gl.getShaderInfoLog(shader))
    return null
  }
  return shader
}

// Returns null when WebGL is unavailable; the card simply has no fog.
export function createFog(downscale: number): FogLayer | null {
  const canvas = document.createElement('canvas')
  canvas.className = 'bv-fog'
  canvas.setAttribute('aria-hidden', 'true')
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true })
  if (!gl) return null

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX)
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
  const program = gl.createProgram()
  if (!vs || !fs || !program) return null
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  // One triangle covering the screen.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  )
  const aPos = gl.getAttribLocation(program, 'aPos')
  gl.enableVertexAttribArray(aPos)
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)
  const uRes = gl.getUniformLocation(program, 'uRes')
  const uTime = gl.getUniformLocation(program, 'uTime')

  const resize = () => {
    canvas.width = Math.max(2, Math.floor(window.innerWidth / downscale))
    canvas.height = Math.max(2, Math.floor(window.innerHeight / downscale))
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(uRes, canvas.width, canvas.height)
  }
  resize()
  window.addEventListener('resize', resize)

  const t0 = performance.now()
  let rafId: number | null = null
  const frame = () => {
    const t = (performance.now() - t0) / 1000
    gl.uniform1f(uTime, t)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    rafId = requestAnimationFrame(frame)
  }
  frame()

  return {
    canvas,
    stop() {
      if (rafId !== null) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', resize)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
