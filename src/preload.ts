// The images a title card or the modem paints from its first frame,
// waited on by both boots (main.ts, dialmain.ts) beside the fonts, so
// nothing pops in after the page starts: the film grain every card lies
// under (styles.css .bv-splash::after, .bv-menu::after, dialup.css
// .bv-modem::after) and the logos. index.html preloads the grain.

// The grain's scan, as the stylesheets name it.
export const GRAIN_URL = '/textures/000973910004.jpg'

// How long boot waits on the images before it goes on without them.
const IMAGE_TIMEOUT_MS = 4000

// Each image fetched and decoded, so its first paint is whole. One that
// fails, or the wait running past the timeout, never holds boot.
export async function imagesReady(srcs: readonly string[]): Promise<void> {
  const timeout = new Promise<void>((resolve) => {
    setTimeout(resolve, IMAGE_TIMEOUT_MS)
  })
  const load = Promise.all(
    srcs.map((src) => {
      const img = new Image()
      img.src = src
      return img.decode().catch((err: unknown) => {
        console.error(`${src} failed to load:`, err)
      })
    })
  ).then(() => undefined)
  await Promise.race([load, timeout])
}
