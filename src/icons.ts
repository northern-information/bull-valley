// The HUD's little marks, drawn as SVG in a 24-unit box in currentColor:
// what each of geometrie's corners means (a weed leaf for high, a pill for
// stimulated, a beer bottle for drunk) and the joint's perception (an eye).
// hud.ts sets them in the triangle's corners, buffhud.ts on each buff. No
// DOM: markup only.

import type { BuffId } from './buffbar.ts'

// A leaflet of the weed leaf, pointing up from the stem's top, `length`
// long, turned `angle` degrees.
function leaflet(angle: number, length: number): string {
  const l = length
  const w = length * 0.2
  return `<path transform="translate(12 18.5) rotate(${angle})" d="M0 0C${w} ${-l * 0.3} ${w} ${-l * 0.7} 0 ${-l}C${-w} ${-l * 0.7} ${-w} ${-l * 0.3} 0 0Z" />`
}

const LEAF = [
  leaflet(0, 16),
  leaflet(-30, 13),
  leaflet(30, 13),
  leaflet(-62, 10),
  leaflet(62, 10),
  leaflet(-96, 6.5),
  leaflet(96, 6.5),
  '<rect x="11.3" y="18" width="1.4" height="5" />',
].join('')

const BOTTLE = `<path d="M10 1.5h4v1.5h-.4v4.2c0 1.4 3 2.6 3 5.3V21.5a1 1 0 0 1-1 1H8.4a1 1 0 0 1-1-1V12.5c0-2.7 3-3.9 3-5.3V3H10z" /><rect x="8.6" y="13.5" width="6.8" height="4.5" fill="#000" fill-opacity="0.45" />`

const PILL = `<g transform="rotate(-45 12 12)"><path d="M12 8H7.5a4 4 0 0 0 0 8H12z" /><path d="M12 8h4.5a4 4 0 0 1 0 8H12z" fill-opacity="0.5" /></g>`

const EYE = `<path d="M1.5 12C5 6 19 6 22.5 12C19 18 5 18 1.5 12Z M12 8.2a3.8 3.8 0 1 0 0 7.6a3.8 3.8 0 1 0 0-7.6Z" fill-rule="evenodd" /><circle cx="12" cy="12" r="1.7" />`

export const ICON_SHAPES: Record<BuffId, string> = {
  high: LEAF,
  stimulated: PILL,
  drunk: BOTTLE,
  perception: EYE,
}

// One mark as a whole SVG element's markup.
export function iconSvg(id: BuffId, className = 'bv-icon'): string {
  return `<svg class="${className}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON_SHAPES[id]}</svg>`
}
