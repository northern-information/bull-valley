// Every gameplay and rendering knob in one place.
export const CONFIG = {
  render: {
    // Internal render resolution is the CSS size divided by this; the canvas
    // is upscaled with image-rendering: pixelated for the PS1 grain.
    downscale: 3,
    // Silent Hill 1 technique: dense exponential fog swallowing a short
    // sightline (~2/density metres before full whiteout), with the PS1
    // downscale supplying the dither. The sky group ignores fog, so the
    // stars and moon stay overhead while the valley closes in.
    fogDensity: 0.016,
    far: 1400,
    // The longest step one frame may take, in seconds, so a stall never
    // jumps the valley ahead.
    maxStep: 0.05,
  },
  player: {
    eyeHeight: 1.7,
    crouchEyeHeight: 1.05,
    walkSpeed: 4.2,
    sprintSpeed: 9,
    crouchSpeed: 2.2,
    scopeSpeedScale: 0.6,
    mouseSensitivity: 0.0023,
    // How close a pickup must be for E to take it.
    pickupReach: 2.6,
    // The body's radius, for the store walls.
    radius: 0.3,
  },
  shadowmen: {
    // Crossings: this many shadowmen at once in a bubble around the player.
    count: 12,
    // They spawn on this ring, just past scope range so blips enter from the
    // rim, cross toward a point within crossRadius of the player, and are
    // dropped past despawnRadius.
    spawnRadius: 300,
    crossRadius: 120,
    despawnRadius: 360,
    // m/s, around player.sprintSpeed: some can be outrun, some cannot.
    speedMin: 7,
    speedMax: 10,
    // Respawns are spaced at least this far apart, in seconds.
    spawnInterval: 0.75,
    // Shadowmen stay this far inside the survey edge.
    edgeInset: 30,
    // One that crosses within rushRadius of you turns and comes at rushSpeed,
    // faster than a sprint; touching you at touchRadius is a strike.
    rushRadius: 25,
    rushSpeed: 12,
    touchRadius: 1.4,
    // Citgo forecourts are havens: shadowmen vanish at the lights and nothing
    // can touch you inside.
    havenRadius: 60,
    // The static after a strike, in real seconds (main.ts times it by the
    // wall clock, never the frame-capped game time).
    strikeSeconds: 1.6,
  },
  items: {
    // Per-item tuning lives in src/items.ts.
    // Walking speed while a cigarette burns.
    smokingSpeedScale: 0.85,
    // Camera drift while perception is on.
    perceptionDrift: 0.5,
  },
  scope: {
    rangeMetres: 250,
    sweepSeconds: 3.2,
  },
  raid: {
    // Pick your loadout before the pickup truck leaves.
    loadoutSeconds: 300,
    // The spawn sits this far from the pump island, toward the truck: on
    // the lot, between the pumps and the road sign.
    spawnOffset: 5,
  },
  store: {
    // Every player starts every raid with this much, in cents.
    startingCash: 4000,
    // Units of every item on each Citgo's shelves at the start of a raid.
    perItem: 3,
    // How close a shelf facing must be, from the eye, for E to buy it.
    reach: 2.2,
    // How far off the view ray, in radians, a facing can sit and still be
    // the one you are looking at.
    aimCone: 0.5,
    // The shelf display moves to the store nearest the player inside this.
    displayRange: 60,
  },
  splash: {
    // Northern Information colophon: triangle-wave fade sized to the
    // natural length of the mp3 (~6s) so the cue ends at silence.
    fadeInMs: 2000,
    holdMs: 2400,
    fadeOutMs: 1600,
    // Skipping cuts to black and tweens out fast so the gesture feels
    // instant; audio tails slightly longer than the visual.
    skipFadeMs: 200,
    skipAudioFadeMs: 300,
    // After the colophon resolves, the black backdrop lifts to reveal the
    // logo card.
    revealFadeMs: 400,
    imageSrc:
      '/applied-sciences-and-phantasms-working-division-flourescent.png',
    alt: 'Northern Information',
    audioSrc: '/sfx/northern-information.mp3',
    hint: 'Click to Play',
  },
  logo: {
    // The game's own title card, straight after the colophon: the same
    // envelope shape, sized to its cue (~14s) so the cue ends at silence.
    fadeInMs: 2000,
    holdMs: 10400,
    fadeOutMs: 1600,
    skipFadeMs: 200,
    skipAudioFadeMs: 300,
    // The backdrop lifts to reveal the character select.
    revealFadeMs: 400,
    imageSrc: '/bull-valley-shadow-wars.png',
    alt: 'Bull Valley Shadow Wars',
    audioSrc: '/sfx/bull-valley-shadow-wars-intro.mp3',
  },
  select: {
    // The character turntable: spin speed and the fade that reveals the
    // intro once a character is chosen.
    spinPerSecond: 0.7,
    revealFadeMs: 400,
  },
  truck: {
    speed: 12, // m/s, about 27 mph — right for gravel-adjacent Bull Valley
    boardRange: 4,
    bedEye: 1.6, // camera height above the bed
    wanderMetres: 6000, // how far the outbound joyride runs
  },
  net: {
    // The valley server. State frames go out at most this often, and only
    // when something changed; peers are drawn this far behind the present
    // so two frames always bracket the moment being drawn.
    sendHz: 10,
    interpolateMs: 150,
    // Give the first connection this long before playing offline.
    connectTimeoutMs: 2000,
    // Clock-offset pings once online.
    pingMs: 10000,
    // Bed seats before riders double up.
    seats: 4,
  },
  cabbage: {
    count: 48,
    // Arms only; the sack's limit is in src/items.ts.
    carryLimit: 3,
    dropRadius: 12,
  },
  extract: {
    fuelRadius: 12,
    keepRadius: 25,
  },
}
