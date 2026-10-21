// Pure: the build's name, shown in the lower right of every screen
// (buildtag.ts): the wire protocol it speaks, the UTC day it was built and
// the commit it was built from, as v38.20261020.398c471. vite.config.ts
// names the day and the commit when it bundles.

// The UTC calendar day of an instant, as YYYYMMDD.
export function buildDay(at: Date): string {
  const y = at.getUTCFullYear()
  const m = String(at.getUTCMonth() + 1).padStart(2, '0')
  const d = String(at.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

// The build's name from its protocol, its day and its commit.
export function buildLabel(
  protocol: number,
  day: string,
  hash: string
): string {
  return `v${protocol}.${day}.${hash}`
}
