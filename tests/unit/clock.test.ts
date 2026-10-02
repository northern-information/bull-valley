import { describe, expect, it } from 'vitest'
import { createClockSync } from '../../src/clock.ts'

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

  it('tolerates a reply that seems to arrive before it left', () => {
    const clock = createClockSync()
    clock.observe({ sentAt: 100, receivedAt: 90, serverNow: 500 })
    expect(clock.rttMs).toBe(0)
    expect(clock.offsetMs).toBe(400)
  })
})
