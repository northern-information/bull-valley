// The build's name in the lower right corner of the screen, over every
// title card, the menu (under its credit) and the valley, always showing.

import { buildLabel } from './build.ts'
import { copy } from './copy.ts'
import { PROTOCOL_VERSION } from './protocol.ts'

// Named by vite.config.ts when it bundles.
declare const __BUILD_DAY__: string
declare const __BUILD_HASH__: string

// The build as the corner names it.
export const BUILD = buildLabel(PROTOCOL_VERSION, __BUILD_DAY__, __BUILD_HASH__)

// Mounts the corner's line as the last child of <body>, over everything.
export function mountBuildTag(): void {
  const tag = document.createElement('p')
  tag.className = 'bv-build'
  tag.textContent = copy('titles.build', { build: BUILD })
  document.body.appendChild(tag)
}
