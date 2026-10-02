// The client's estimate of the server clock. Every shared moment in the
// valley (when the truck left, when the clock runs out) is a server
// timestamp, and this converts between those and the local clock. Pure.
//
// Each round trip gives one sample: the server's time, bracketed by when the
// request left and when the reply arrived. The server read its clock about
// halfway through, so offset = serverNow - (sentAt + rtt / 2). The sample
// with the shortest round trip is the least uncertain, so it wins.

export interface ClockSample {
  sentAt: number
  receivedAt: number
  serverNow: number
}

export interface ClockSync {
  // True once at least one sample has been observed.
  readonly synced: boolean
  // Server minus local, in ms. 0 until synced.
  readonly offsetMs: number
  // The round trip of the sample in use. Infinity until synced.
  readonly rttMs: number
  observe(sample: ClockSample): void
  serverNow(localMs: number): number
  toLocalMs(serverMs: number): number
}

export function createClockSync(): ClockSync {
  let offsetMs = 0
  let rttMs = Infinity
  let synced = false
  return {
    get synced() {
      return synced
    },
    get offsetMs() {
      return offsetMs
    },
    get rttMs() {
      return rttMs
    },
    observe({ sentAt, receivedAt, serverNow }) {
      const rtt = Math.max(0, receivedAt - sentAt)
      if (synced && rtt > rttMs) return
      offsetMs = serverNow - (sentAt + rtt / 2)
      rttMs = rtt
      synced = true
    },
    serverNow(localMs) {
      return localMs + offsetMs
    },
    toLocalMs(serverMs) {
      return serverMs - offsetMs
    },
  }
}
