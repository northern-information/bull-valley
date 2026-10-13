// Pure: the little arithmetic more than one module reaches for.

// `value` held between 0 and 1.
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

// The golden angle, in radians: turning by it once per id spreads any
// number of things evenly round a circle, no two in line.
export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

// Where thing `id` sits on a circle of `radius` round `at`, turned by the
// golden angle a time: drops from one spot, stones beside their dimes.
export function goldenSpot(
  at: { x: number; z: number },
  id: number,
  radius: number
): { x: number; z: number } {
  const turn = id * GOLDEN_ANGLE
  return {
    x: at.x + Math.cos(turn) * radius,
    z: at.z + Math.sin(turn) * radius,
  }
}
