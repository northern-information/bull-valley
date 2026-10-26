import { describe, expect, it } from 'vitest'
import { copy } from '../../src/copy.ts'
import { filmTitle } from '../../src/drivein.ts'
import { threadedLine, threadRefusal } from '../../src/filmlines.ts'

describe('what the drive-in says', () => {
  const film = 'carnival_of_souls.mp4'

  it('says what was threaded, and by whom', () => {
    const title = filmTitle(film)
    expect(threadedLine({ film, mine: true, name: 'Ana' })).toBe(
      copy('log.threaded', { film: title })
    )
    expect(threadedLine({ film, mine: false, name: 'Bo' })).toBe(
      copy('log.threaded_other', { name: 'Bo', film: title })
    )
    expect(threadedLine({ film, mine: false, name: '' })).toBe(
      copy('log.threaded_someone', { film: title })
    )
  })

  it('says why nothing was threaded', () => {
    expect(threadRefusal('too-far')).toBe(copy('log.thread_far'))
    expect(threadRefusal('aboard')).toBe(copy('log.thread_far'))
    expect(threadRefusal('not-in-valley')).toBe(copy('log.thread_offline'))
    expect(threadRefusal('no-film')).toBe(copy('log.thread_refused'))
  })
})
