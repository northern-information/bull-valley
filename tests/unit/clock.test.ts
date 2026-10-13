import { describe, expect, it } from 'vitest'
import { createClockSync, STALE_MS } from '../../src/clock.ts'

describe('clock sync', () => {
  it('starts unsynced with no offset', () => {
    const clock = createClockSync()
    expect(clock.synced).toBe(false)
    expect(clock.offsetMs).toBe(0)
    expect(clock.rttMs).toBe(Infinity)
    expect(clock.serverNow(1000)).toBe(1000)
    expect(clock.toLocalMs(1000)).toBe(1000)
  })

  it('reads the offset from the middle of the round trip', () => {
    const clock = createClockSync()
    // Sent at 100, back at 140: the server read 5000 at about 120.
    clock.observe({ sentAt: 100, receivedAt: 140, serverNow: 5000 })
    expect(clock.synced).toBe(true)
    expect(clock.offsetMs).toBe(4880)
    expect(clock.rttMs).toBe(40)
    expect(clock.serverNow(200)).toBe(5080)
    expect(clock.toLocalMs(5080)).toBe(200)
  })

  it('keeps the sample with the shortest round trip', () => {
    const clock = createClockSync()
    clock.observe({ sentAt: 0, receivedAt: 200, serverNow: 1100 })
    expect(clock.offsetMs).toBe(1000)
    clock.observe({ sentAt: 1000, receivedAt: 1020, serverNow: 2015 })
    expect(clock.offsetMs).toBe(1005)
    expect(clock.rttMs).toBe(20)
    // A slower sample later does not replace it.
    clock.observe({ sentAt: 2000, receivedAt: 2300, serverNow: 3400 })
    expect(clock.offsetMs).toBe(1005)
    // An equally fast one does; it is newer.
    clock.observe({ sentAt: 3000, receivedAt: 3020, serverNow: 4012 })
    expect(clock.offsetMs).toBe(1002)
  })

  it('lets a slower sample replace one kept too long', () => {
    const clock = createClockSync()
    clock.observe({ sentAt: 0, receivedAt: 20, serverNow: 1010 })
    expect(clock.offsetMs).toBe(1000)
    // Still fresh: a slower sample is passed over.
    const later = STALE_MS - 1000
    clock.observe({
      sentAt: later,
      receivedAt: later + 100,
      serverNow: later + 2050,
    })
    expect(clock.offsetMs).toBe(1000)
    // Kept long enough (the clock slept): the next sample is taken.
    const stale = STALE_MS + 1000
    clock.observe({
      sentAt: stale,
      receivedAt: stale + 100,
      serverNow: stale + 2050,
    })
    expect(clock.offsetMs).toBe(2000)
    expect(clock.rttMs).toBe(100)
    // And is kept, in its turn, against a slower one.
    clock.observe({
      sentAt: stale + 200,
      receivedAt: stale + 400,
      serverNow: stale + 3300,
    })
    expect(clock.offsetMs).toBe(2000)
  })

  it('tolerates a reply that seems to arrive before it left', () => {
    const clock = createClockSync()
    clock.observe({ sentAt: 100, receivedAt: 90, serverNow: 500 })
    expect(clock.rttMs).toBe(0)
    expect(clock.offsetMs).toBe(400)
  })
})
