import * as THREE from 'three'
import { CONFIG } from './config.ts'
import { filmUrl, offReel, reelSeconds, screenVolume } from './drivein.ts'
import { SCREEN_BLANK, SCREEN_LIT } from './driveinmodel.ts'
import type { Reel } from './drivein.ts'
import type { DriveInSite } from './driveinsite.ts'

// The drive-in's film, run (sharedworld.ts rule 41): one <video> playing
// the valley's reel off the films route (worker/films.ts) onto the
// screen's picture, looped, held to where the valley's clock says the reel
// is (drivein.ts reelSeconds) so everyone sees the same frame, heard from
// the screen at the Music setting and falling away with the distance.
// The film is fetched only while the raider is within loadRange of the
// screen, and let go past it. A silent page (silent.ts) sees it unheard.

interface ReelFrame {
  // The valley's reel, or null while none is threaded.
  reel: Reel | null
  // The valley's clock, ms.
  now: number
  // Seconds of the game's own clock, for the reels' turning.
  t: number
  // The raider's feet.
  x: number
  z: number
  // The player has begun (a click has armed the page's sound), and the
  // music setting in percent.
  started: boolean
  setting: number
}

export interface ReelPlayer {
  update(frame: ReelFrame): void
}

// How often the film is held to the valley's clock, in seconds of the
// game's: often enough that a stall is caught, rare enough that a seek
// never stutters it.
const CHECK_SECONDS = 1
// How fast the reels turn while a film plays, in turns a second.
const REEL_TURNS = 0.6
// The film is let go this far past where it is fetched, so standing on
// the edge never fetches it over and over.
const LET_GO = 1.2

export function createReelPlayer(
  site: DriveInSite,
  silent: boolean
): ReelPlayer {
  const video = document.createElement('video')
  video.loop = true
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.crossOrigin = 'anonymous'
  const texture = new THREE.VideoTexture(video)
  texture.colorSpace = THREE.SRGBColorSpace
  // The PS1 look: the film's pixels kept hard at the downscaled frame.
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  const material = site.picture.material

  let loaded: string | null = null
  let since = 0
  let checkAt = 0
  let showing = false

  const blank = () => {
    material.map = null
    material.color.set(SCREEN_BLANK)
    material.needsUpdate = true
    site.beam.visible = false
    showing = false
  }

  const letGo = () => {
    if (loaded === null) return
    video.pause()
    video.removeAttribute('src')
    video.load()
    loaded = null
    blank()
  }

  // A play the browser refused (sound before a click, or a film gone
  // missing) is tried again at the next check, never thrown.
  const play = () => {
    video.play().catch(() => {})
  }

  // Once the film's length is known, on the reel, and showing.
  video.addEventListener('loadedmetadata', () => {
    checkAt = 0
  })
  video.addEventListener('playing', () => {
    if (loaded === null) return
    material.map = texture
    material.color.set(SCREEN_LIT)
    material.needsUpdate = true
    site.beam.visible = true
    showing = true
  })
  video.addEventListener('error', () => {
    if (loaded !== null) blank()
  })

  return {
    update(frame) {
      const { reel } = frame
      const [sx, , sz] = site.screen
      const distance = Math.hypot(frame.x - sx, frame.z - sz)
      const { loadRange } = CONFIG.driveIn
      if (!reel || distance > loadRange * LET_GO) {
        letGo()
        return
      }
      if (distance > loadRange && loaded === null) return
      if (loaded !== reel.film || since !== reel.since) {
        if (loaded !== reel.film) {
          video.src = filmUrl(reel.film)
          loaded = reel.film
        }
        since = reel.since
        checkAt = 0
      }
      // Heard from the screen, at the setting, once the page may sound.
      const volume =
        silent || !frame.started
          ? 0
          : (frame.setting / 100) * screenVolume(distance)
      video.muted = volume <= 0
      video.volume = Math.min(1, Math.max(0, volume))
      // The reels turn while it plays.
      if (showing) {
        for (const r of site.reels)
          r.rotation.x = -frame.t * REEL_TURNS * Math.PI * 2
      }
      if (frame.t < checkAt) return
      checkAt = frame.t + CHECK_SECONDS
      const duration = video.duration
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && duration > 0) {
        const want = reelSeconds(reel, frame.now, duration)
        if (offReel(video.currentTime, want, duration)) video.currentTime = want
      }
      if (video.paused) play()
    },
  }
}
