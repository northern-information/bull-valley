// Pure: the little arithmetic more than one module reaches for.

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

// The point `metres` in front of `at`, facing `yaw` (yaw 0 faces -Z, as
// the player does); behind it for negative metres.
export function ahead(
  at: { x: number; z: number },
  yaw: number,
  metres: number
): { x: number; z: number } {
  return {
    x: at.x - Math.sin(yaw) * metres,
    z: at.z - Math.cos(yaw) * metres,
  }
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
