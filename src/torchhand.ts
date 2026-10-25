import { context2d } from './canvas.ts'
import { CUFF, fillPolys, SKIN, SKIN_SHADE, SLEEVE } from './phone.ts'
import type { SwingPose } from './held.ts'
import type { Poly } from './phone.ts'

// The torch in the raider's own hand (held.ts, sharedworld.ts rule 39),
// drawn as the phone is (phone.ts): the same hand in the same flat
// polygons, its fist clenched round a pine stake, the kerosene rag wired
// on top and its fire flickering, all in one small canvas that CSS
// upscales pixelated. It comes up from the bottom right while the torch is
// in hand and goes down when it is not; a swing (held.ts swingPose) draws
// it back and chops it down and across the view. A peer's torch is the 3D
// one in their fist (heldmodels.ts).

// Design grid, and the canvas: one canvas pixel covers about as many
// screen pixels as the phone's.
const GRID_W = 200
const GRID_H = 400
const WIDTH = 90
const K = WIDTH / GRID_W
const HEIGHT = Math.round(GRID_H * K)

const WOOD = '#6b4a2a'
const WOOD_SHADE = '#4a321c'
const RAG = '#2a2018'
const RAG_LIGHT = '#3d2f22'
const WIRE = '#7a7c80'

// Behind the stake: the sleeve, the cuff, and the back of the fist.
// prettier-ignore
const BACK: Poly[] = [
  [SLEEVE, [[46, 400], [56, 336], [156, 336], [166, 400]]],
  [CUFF, [[52, 342], [56, 320], [150, 320], [154, 342]]],
  [SKIN, [[58, 326], [54, 262], [70, 236], [150, 236], [160, 262], [154, 326]]],
  [SKIN_SHADE, [[54, 262], [58, 326], [96, 326], [86, 270]]],
]

// The stake up out of the fist, and the rag wired round its head.
// prettier-ignore
const STAKE: Poly[] = [
  [WOOD, [[91, 126], [109, 126], [111, 250], [89, 250]]],
  [WOOD_SHADE, [[103, 126], [109, 126], [111, 250], [105, 250]]],
  [RAG, [[74, 132], [126, 132], [130, 80], [70, 80]]],
  [RAG_LIGHT, [[74, 132], [88, 132], [86, 80], [70, 80]]],
  [WIRE, [[72, 96], [128, 96], [128, 101], [72, 101]]],
  [WIRE, [[73, 117], [127, 117], [127, 122], [73, 122]]],
]

// In front of it: four fingers curled round it from the left, each with
// the crease of its knuckle, and the thumb over the top.
const FINGERS: Poly[] = [0, 1, 2, 3].flatMap((n): Poly[] => {
  const top = 238 + n * 19
  const right = 126 - n * 3
  return [
    [
      SKIN,
      [
        [64, top + 4],
        [70, top],
        [right, top],
        [right + 4, top + 9],
        [right, top + 18],
        [70, top + 18],
        [64, top + 14],
      ],
    ],
    [
      SKIN_SHADE,
      [
        [64, top + 14],
        [right, top + 15],
        [right, top + 18],
        [70, top + 18],
      ],
    ],
  ]
})
// prettier-ignore
const THUMB: Poly[] = [
  [SKIN, [[106, 236], [146, 224], [158, 234], [152, 248], [112, 254]]],
  [SKIN_SHADE, [[112, 254], [152, 248], [150, 244], [114, 249]]],
]

// The fire's layers, outside in: the colour, and how big against the
// outermost.
const FLAMES: [string, number][] = [
  ['#ff4a12', 1],
  ['#ff9a2a', 0.72],
  ['#ffe08a', 0.42],
]
// Where the fire stands on the rag, how wide its foot and how tall.
const FIRE_X = 100
const FIRE_Y = 86
const FIRE_W = 30
const FIRE_H = 74

// How far the swing tips and carries the hand: degrees a radian of the
// arm's tilt, and screen fractions of the hand's width a radian of the
// chop and of its sweep across.
const TILT_DEG = 26
const DROP = 0.25
const SWEEP = 0.9
// The hand's own lean at rest, degrees, as the phone's.
const LEAN = -7

export class TorchHand {
  private readonly ctx: CanvasRenderingContext2D
  private readonly holder: HTMLElement
  private raised = false

  // holder is the element that slides up when the torch is in hand.
  constructor(canvas: HTMLCanvasElement, holder: HTMLElement = canvas) {
    this.ctx = context2d(canvas)
    this.holder = holder
    canvas.width = WIDTH
    canvas.height = HEIGHT
  }

  // A frame on: up while the torch is in hand, its fire burning on `time`
  // (seconds), tipped and carried by the swing.
  update(held: boolean, time: number, swing: SwingPose): void {
    if (held !== this.raised) {
      this.raised = held
      this.holder.classList.toggle('bv-torch--raised', held)
    }
    if (!held) return
    const deg = LEAN + swing.tilt * TILT_DEG
    const across = -swing.sweep * SWEEP * 100
    const down = Math.max(0, -swing.tilt) * DROP * 100
    this.holder.style.transform =
      `translate(${across.toFixed(1)}%, ${down.toFixed(1)}%) ` +
      `rotate(${deg.toFixed(1)}deg)`
    this.draw(time)
  }

  private draw(time: number): void {
    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, WIDTH, HEIGHT)
    ctx.setTransform(K, 0, 0, K, 0, 0)
    fillPolys(ctx, BACK)
    fillPolys(ctx, STAKE)
    fillPolys(ctx, FINGERS)
    fillPolys(ctx, THUMB)
    // The fire, each layer licking on its own beat.
    FLAMES.forEach(([color, k], n) => {
      const phase = n * 1.7
      const w = FIRE_W * k
      const h = FIRE_H * k * (1 + 0.14 * Math.sin(time * 9 + phase))
      const lick = 7 * Math.sin(time * 6 + phase)
      const waist = FIRE_Y - h * 0.5
      const swell = 4 * Math.sin(time * 13 + phase)
      fillPolys(ctx, [
        [
          color,
          [
            [FIRE_X - w, FIRE_Y],
            [FIRE_X - w * 0.85 - swell, waist],
            [FIRE_X + lick, FIRE_Y - h],
            [FIRE_X + w * 0.85 + swell, waist],
            [FIRE_X + w, FIRE_Y],
          ],
        ],
      ])
    })
    // Sparks flying up off it.
    ctx.fillStyle = '#ffd27a'
    for (let n = 0; n < 4; n++) {
      const rise = (time * 70 + n * 41) % 80
      const x = FIRE_X + Math.sin(time * 3 + n * 2.1) * 20
      ctx.fillRect(x, FIRE_Y - FIRE_H * 0.6 - rise, 4, 4)
    }
  }
}
