// Pure: the laptop on the card table in the Citgo bathroom (sharedworld.ts
// rule 31). It runs a text editor over a pretend file system every raider
// shares: the readme (LAPTOP.TXT at the repo root, read-only, always
// first) and under it a folder for each raider holding the files they
// wrote. Anyone can read any file; only its writer can change or delete
// it. The files are the valley's, kept in D1 (worker/d1accounts.ts), and
// the valley writes them only for a raider whose last state frame put them
// at a Citgo. No three.js, no DOM.

import { CONFIG } from './config.ts'
import type { XZ } from './interfaces.ts'

// The readme's id. It is never in the store, and never written.
export const README_ID = 'readme'

// A file as the store keeps it, without its text: who wrote it (the
// account, never on the wire, and its username), its name, how long its
// text is, and when it was last saved.
export interface LaptopFileRow {
  id: string
  account: string
  owner: string
  name: string
  size: number
  updated: number
}

// A file as the wire lists it: the account swapped for whether it is the
// listener's own.
export interface LaptopFileInfo {
  id: string
  owner: string
  name: string
  size: number
  updated: number
  mine: boolean
}

// Why a save is refused: the file is someone else's (or gone), the writer
// has another of that name, or already keeps as many as they may.
export type SaveRefusal = 'not-yours' | 'name-taken' | 'too-many'

// A file's name: letters, digits, spaces, dots, dashes, underscores and
// brackets, not starting with a dot or a space nor ending with a space.
const NAME = /^[A-Za-z0-9_()-][A-Za-z0-9 ._()-]*$/

export function isFileName(name: unknown, cfg = CONFIG): name is string {
  return (
    typeof name === 'string' &&
    name.length <= cfg.laptop.nameMax &&
    NAME.test(name) &&
    !name.endsWith(' ')
  )
}

// A file's id, as the store makes them.
const ID = /^[a-z0-9]{1,32}$/

export function isFileId(id: unknown): id is string {
  return typeof id === 'string' && ID.test(id) && id !== README_ID
}

// Control characters a file never keeps: everything under a space but the
// tab and the newline, and DEL.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g

// A file's text as it is kept: line endings made one newline and stray
// control characters dropped, every space, tab and line kept as typed.
export function normalizeBody(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(CONTROL, '')
}

// Whether a text may be saved as it stands: already normal, and no longer
// than a file holds.
export function isFileBody(text: unknown, cfg = CONFIG): text is string {
  return (
    typeof text === 'string' &&
    text.length <= cfg.laptop.bodyMax &&
    normalizeBody(text) === text
  )
}

// Why the valley will not save `name` (as file `id`, or a new one with
// null) for a writer who keeps `own`, or null when it will.
export function saveRefusal(
  own: readonly Pick<LaptopFileRow, 'id' | 'name'>[],
  id: string | null,
  name: string,
  cfg = CONFIG
): SaveRefusal | null {
  if (id !== null && !own.some((f) => f.id === id)) return 'not-yours'
  if (
    own.some((f) => f.id !== id && f.name.toLowerCase() === name.toLowerCase())
  ) {
    return 'name-taken'
  }
  if (id === null && own.length >= cfg.laptop.perAccount) return 'too-many'
  return null
}

// Whether a raider at `at` stands at a Citgo, close enough to its
// bathroom for the valley to open the files: within stationReach of a
// station's pump island (`havens`, one per station).
export function atLaptop(
  at: XZ | null,
  havens: readonly XZ[],
  cfg = CONFIG
): boolean {
  if (!at) return false
  return havens.some(
    (h) => Math.hypot(h.x - at.x, h.z - at.z) <= cfg.laptop.stationReach
  )
}

// The files as `account` is sent them: by writer, then by name, any case.
export function listingFor(
  rows: readonly LaptopFileRow[],
  account: string
): LaptopFileInfo[] {
  const order = (a: string, b: string) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  return [...rows]
    .sort((a, b) => order(a.owner, b.owner) || order(a.name, b.name))
    .map((row) => ({
      id: row.id,
      owner: row.owner,
      name: row.name,
      size: row.size,
      updated: row.updated,
      mine: row.account === account,
    }))
}

// The folders the desktop shows, one a writer, each with its files in
// order: the listener's own first, made even while it holds nothing, so
// there is always somewhere to save.
export interface LaptopFolder {
  owner: string
  mine: boolean
  files: LaptopFileInfo[]
}

export function foldersOf(
  files: readonly LaptopFileInfo[],
  me: string
): LaptopFolder[] {
  const folders: LaptopFolder[] = [{ owner: me, mine: true, files: [] }]
  for (const file of files) {
    const mine = file.mine
    let folder = mine
      ? folders[0]
      : folders.find((f) => !f.mine && f.owner === file.owner)
    if (!folder) {
      folder = { owner: file.owner, mine: false, files: [] }
      folders.push(folder)
    }
    folder.files.push(file)
  }
  return folders
}

// A line and a column (both from 1) at offset `at` in `text`, for the
// editor's status bar.
export function caretOf(
  text: string,
  at: number
): { line: number; col: number } {
  const before = text.slice(0, Math.max(0, Math.min(at, text.length)))
  const lines = before.split('\n')
  return { line: lines.length, col: lines[lines.length - 1].length + 1 }
}

// A line with its tabs turned to spaces, to the next eighth column, as
// the screen shows it.
export function expandTabs(line: string): string {
  let out = ''
  for (const ch of line) {
    if (ch === '\t') out += ' '.repeat(8 - (out.length % 8))
    else out += ch
  }
  return out
}
