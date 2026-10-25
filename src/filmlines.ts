// What the drive-in says (drivein.ts, sharedworld.ts rule 41): the log
// line for a film threaded, ours or another's, and the line for a
// refusal. Pure but for the copy book; no three.js, no DOM.

import { copy } from './copy.ts'
import { filmTitle } from './drivein.ts'

// What the log says of a film threaded on the projector: by us, or by
// someone else, by name.
export function threadedLine(news: {
  film: string
  mine: boolean
  name: string
}): string {
  const film = filmTitle(news.film)
  if (news.mine) return copy('log.threaded', { film })
  return news.name
    ? copy('log.threaded_other', { name: news.name, film })
    : copy('log.threaded_someone', { film })
}

// Why the valley would not thread it.
export function threadRefusal(reason: string): string {
  switch (reason) {
    case 'too-far':
    case 'aboard':
      return copy('log.thread_far')
    case 'not-in-valley':
      return copy('log.thread_offline')
    default:
      return copy('log.thread_refused')
  }
}
