// The page's one script (index.html): the 3D valley (main.ts) for anything
// with a mouse, Bull Valley Dial-Up (dialmain.ts) for a phone, each loaded
// only when picked (dialpick.ts), so a phone never fetches three.js.

import { pickApp } from './dialpick.ts'

const app = pickApp(window.location.search, {
  coarse: window.matchMedia('(pointer: coarse)').matches,
  fine: window.matchMedia('(any-pointer: fine)').matches,
})
if (app === 'dialup') void import('./dialmain.ts')
else void import('./main.ts')
