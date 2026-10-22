// Fireflies bursting out over a fish landed (catchfanfare.ts), the same in
// both apps: over the 3D valley's view (hud.ts) and over the pond's
// scene on Dial-Up (dialfish.ts). A flash, then a ring of sparks flung out
// from the middle and falling away, more of them the bigger the fish, gold
// for a big one or the legend. styles.css draws it; each spark's way out
// and its delay ride on CSS variables. DOM glue.

import { FANFARE } from './catchfanfare.ts'
import { el } from './dom.ts'
import type { Fanfare } from './catchfanfare.ts'

// How long a burst lasts before it is taken down, ms; styles.css's
// bv-burst animations end inside it.
const BURST_MS = 2600

export function burst(parent: HTMLElement, fanfare: Fanfare): void {
  const root = el('div', `bv-burst bv-burst--${fanfare.tier}`)
  root.setAttribute('aria-hidden', 'true')
  const count = FANFARE.sparks[fanfare.tier]
  for (let i = 0; i < count; i++) {
    const spark = el('span', 'bv-burst-spark')
    // Round the ring, a little off even, each flung its own way out.
    const angle = (i / count) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.2
    const reach = 0.55 + ((i * 37) % 11) / 22
    spark.style.setProperty('--x', (Math.cos(angle) * reach).toFixed(3))
    spark.style.setProperty('--y', (Math.sin(angle) * reach).toFixed(3))
    spark.style.setProperty('--delay', `${(i % 5) * 60}ms`)
    root.append(spark)
  }
  parent.append(root)
  setTimeout(() => root.remove(), BURST_MS)
}
