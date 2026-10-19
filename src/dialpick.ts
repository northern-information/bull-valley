// Pure: which app a page opens (entry.ts): the 3D valley, or Bull Valley
// Dial-Up, the valley on a phone (sharedworld.ts rule 29). `?dialup` and
// `?valley3d` say outright; otherwise a device that only touches (a coarse
// pointer and no fine one anywhere) dials up, and anything with a mouse or
// a trackpad walks the valley.

export type App = 'valley' | 'dialup'

export const DIALUP_PARAM = 'dialup'
export const THREE_D_PARAM = 'valley3d'

export interface Pointers {
  // (pointer: coarse): the main pointer is a finger.
  coarse: boolean
  // (any-pointer: fine): some pointer is a mouse, a pen or a trackpad.
  fine: boolean
}

export function pickApp(search: string, pointers: Pointers): App {
  const params = new URLSearchParams(search)
  if (params.has(DIALUP_PARAM)) return 'dialup'
  if (params.has(THREE_D_PARAM)) return 'valley'
  return pointers.coarse && !pointers.fine ? 'dialup' : 'valley'
}

// The same page in the other app, for the link that switches.
export function switchUrl(
  location: { pathname: string; search: string; hash: string },
  to: App
): string {
  const params = new URLSearchParams(location.search)
  params.delete(DIALUP_PARAM)
  params.delete(THREE_D_PARAM)
  params.set(to === 'dialup' ? DIALUP_PARAM : THREE_D_PARAM, '')
  const query = params.toString().replace(/=(&|$)/g, '$1')
  return `${location.pathname}?${query}${location.hash}`
}
