import source from '../LAPTOP.TXT?raw'
import { normalizeBody } from './laptop.ts'

// The readme on the laptop in the Citgo bathroom (laptop.ts): LAPTOP.TXT
// at the repo root, shipped as typed, every space, tab and line kept. It
// is always the first file, and no one writes over it.
export const README = normalizeBody(source)
