// Pure: stepping through a list that wraps, as the character select and
// Gron's turntable do.

// One step left (-1) or right (+1), wrapping. An empty list stays at 0.
export function stepIndex(index: number, count: number, dir: number): number {
  if (count < 1) return 0
  return (((index + dir) % count) + count) % count
}
