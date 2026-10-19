// IBM Plex Mono, waited on before any text exists, by the 3D valley's boot
// (main.ts) and Bull Valley Dial-Up's (dialmain.ts) alike.

// How long boot waits for IBM Plex Mono before it draws in the fallback face.
const FONT_TIMEOUT_MS = 3000

// The weights the HUD and canvas text use; the italic loads on first use.
const FONT_WEIGHTS = [400, 600, 700]

// IBM Plex Mono, loaded before any text exists, so nothing paints in a
// fallback and then reflows when the face lands (index.html preloads it).
// Canvas text (the phone, name tags) is drawn after boot, so it gets the face
// too. A font that never arrives must not hold the game: past the timeout,
// boot goes on.
export async function fontsReady(): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, FONT_TIMEOUT_MS)
  })
  const load = Promise.all(
    FONT_WEIGHTS.map((w) => document.fonts.load(`${w} 1em "IBM Plex Mono"`))
  ).then(
    () => undefined,
    (err: unknown) => {
      console.error('IBM Plex Mono failed to load:', err)
    }
  )
  await Promise.race([load, timeout])
}
