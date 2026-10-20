// Whether this page plays no sound at all: under e2e, and in a dev build
// that a browser tool drives (navigator.webdriver) or that the URL asks to
// mute (?mute). An agent driving the game in a browser that does not set
// webdriver adds ?mute. Read once, when the page loads; both boots build
// their music, sounds and the modem's handshake only when it is false.
export const SILENT =
  import.meta.env.MODE === 'test' ||
  (import.meta.env.DEV &&
    (navigator.webdriver ||
      new URLSearchParams(window.location.search).has('mute')))
