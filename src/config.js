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
  },
  player: {
    eyeHeight: 1.7,
    crouchEyeHeight: 1.05,
    walkSpeed: 4.2,
    sprintSpeed: 9,
    crouchSpeed: 2.2,
    scopeSpeedScale: 0.6,
    mouseSensitivity: 0.0023,
  },
  shadowmen: {
    count: 14,
    // Beyond this they drift dormant; inside it they start working on you.
    activateRange: 150,
    stalkDistance: 34,
    stalkSpeed: 3.4,
    huntSpeed: 8,
    strikeRange: 2.4,
    escapeRange: 70,
    escapeSeconds: 8,
    // Staring at one this long provokes it.
    stareSeconds: 4,
    detectRange: 45,
    detectThreshold: 6,
  },
  items: {
    // Cigarettes: nerves drain hard while smoking, but the ember raises the
    // shadowmen's detection range while lit and for emberSeconds after.
    // Per brand (ids from brands.js); crackle adds the kretek's clove pop.
    cigarettes: {
      marlboro: { smokeSeconds: 12, emberSeconds: 20 },
      camel: { smokeSeconds: 14, emberSeconds: 20 },
      parliament: { smokeSeconds: 13, emberSeconds: 16 },
      newport: { smokeSeconds: 9, emberSeconds: 14 },
      djarum: { smokeSeconds: 18, emberSeconds: 26, crackle: true },
    },
    emberDetectScale: 1.5,
    // Joint: two minutes of perception — shadowmen resolve through the murk —
    // but the nerves meter reads soft and slow the whole time.
    jointSeconds: 15,
    perceptionSeconds: 120,
  },
  scope: {
    rangeMetres: 250,
    sweepSeconds: 3.2,
  },
  raid: {
    // Pick your loadout before the pickup truck leaves.
    loadoutSeconds: 300,
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
    // After the logo resolves, the black backdrop lifts to reveal the intro.
    revealFadeMs: 400,
    imageSrc:
      '/applied-sciences-and-phantasms-working-division-flourescent.png',
    audioSrc: '/sfx/northern-information.mp3',
    hint: 'Press Any Key To Begin',
  },
  truck: {
    speed: 12, // m/s, about 27 mph — right for gravel-adjacent Bull Valley
    boardRange: 4,
    arriveRange: 30, // called truck stops this close to the player's road point
    bedEye: 1.6, // camera height above the bed
    wanderMetres: 6000, // how far the outbound joyride runs
  },
  cabbage: {
    count: 48,
    carryLimit: 3,
    sackCarryLimit: 5,
    dropRadius: 12,
  },
  extract: {
    fuelRadius: 12,
    keepRadius: 25,
  },
  shop: {
    // Per-raid purchase caps; there is no currency yet. Packs per brand.
    cigarettes: {
      marlboro: 2,
      camel: 2,
      parliament: 2,
      newport: 2,
      djarum: 2,
    },
    joints: 2,
  },
}
