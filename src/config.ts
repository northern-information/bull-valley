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
    // The static after a strike, in real seconds (actions.ts times it by the
    // wall clock, never the frame-capped game time).
    strikeSeconds: 1.6,
    // A shadowman held this many seconds in the flashlight's beam bursts;
    // out of the beam the count runs back down at the same rate. The beam
    // is aimed at a point this far over the ground it stands on.
    burnSeconds: 0.5,
    chestHeight: 1.4,
    // In the shared valley the server steps them this many times a second
    // and sends each step; clients draw them between the last two.
    tickHz: 10,
  },
  // The flashlight in the left hand: the beam that burns shadowmen reaches
  // range metres, halfAngle radians off the line of sight. The light itself
  // is one physical spot, in candela, like the truck's lamps.
  flashlight: {
    range: 30,
    halfAngle: 0.3,
    color: '#fff1c8',
    intensity: 1400,
    distance: 40,
    angle: 0.42,
    penumbra: 0.5,
  },
  // Both first-person hands come up and go down over raiseSeconds; an item
  // used from the pack or the hotbar is held up in the right hand for
  // holdSeconds between.
  hands: {
    raiseSeconds: 0.22,
    holdSeconds: 0.9,
  },
  mist: {
    // Ground mist: this many banks drift in a square bubble, radius metres
    // to a side from the player, wrapping to the far side as they leave it.
    // The radius sits where the scene fog has all but swallowed a card.
    count: 56,
    radius: 110,
    // The wind in metres per second, world axes (+x east, +z south); each
    // bank adds its own drift of up to this much on top.
    wind: { x: 0.7, z: -0.4 },
    drift: 0.25,
    // A bank is this many metres across and aspect of that tall, with lift
    // of its height over the ground and the rest sunk into the terrain.
    widthMin: 14,
    widthMax: 30,
    aspect: 0.26,
    lift: 0.3,
    // Each bank swells and thins once per period, seconds.
    periodMin: 14,
    periodMax: 36,
    // Peak opacity; the metres over which a bank dissolves as the player
    // walks into it, and over which it thins at the bubble's edge.
    opacity: 0.6,
    nearFade: 8,
    edgeFade: 20,
    // How many painted textures the banks share.
    looks: 4,
  },
  items: {
    // Per-item tuning lives in src/items.ts.
    // Walking speed while a cigarette burns.
    smokingSpeedScale: 0.85,
  },
  // What anything smoked or drunk does to the view (trip.ts, trails.ts).
  trip: {
    // The blur each use starts with, fading out over this long.
    blurSeconds: 1,
    // The blur's reach at its height, in internal pixels.
    blurRadius: 3,
    // How much of the last frame each frame keeps while trails are full:
    // nearer 1, longer trails.
    persistence: 0.86,
    // The trails thin out over the last this-many seconds of the trip.
    fadeSeconds: 4,
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
    // A new account's wallet, in cents (worker/packs.ts); it carries from
    // raid to raid. Played alone, every raid starts with this much.
    startingCash: 4000,
    // Units of every item on each Citgo's shelves at the start of a raid.
    perItem: 3,
    // How close a shelf unit must be, from the eye, for E to buy it.
    reach: 2.2,
    // How far off the view ray, in radians, a unit can sit and still be
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
    audioSrc: '/sfx/northern-information.mp3',
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
    // When the clock runs out with nobody aboard, Matthew Marx crosses Lake
    // Avenue to the field between the road and the corn maze and does
    // donuts there (donuts.ts) until someone whistles. `field` is
    // station-local like CONFIG.maze.at: across the road from the lot, short
    // of the maze's near end and its mud trail out.
    donuts: {
      field: { x: 60, z: -5 },
      radius: 22,
      speed: 9, // m/s
      metres: 12000, // about 20 minutes of donuts, then he parks
      // Each loop's radius, drawn per set.
      loop: { min: 5, max: 10 },
      // How far the nose swings into the turn at the tightest loop.
      drift: 0.6,
    },
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
    // How long the "signed out" line sits in the chat log before the page
    // reloads to the sign-in card.
    signedOutReloadMs: 2500,
  },
  cabbage: {
    count: 48,
    // The cabbages the arms hold.
    carryLimit: 3,
  },
  // Items dropped from the pack or the arms (drops.ts).
  drops: {
    // How far ahead of the raider a drop lands, in metres.
    ahead: 1.2,
    // The circle drops from one spot are spread round, in metres.
    scatter: 0.35,
  },
  extract: {
    fuelRadius: 12,
    keepRadius: 25,
  },
  daily: {
    // The berry bush at the spawn Citgo: how close E must be to pick.
    reach: 2.6,
    // Where it stands, station-local (local +X toward the road, Z along
    // it): in the grass beside the store, a stride off its side wall and
    // just behind the lot's edge, on the side away from the sign.
    bush: { x: -8.5, z: -8.5 },
    // It blocks like a post this wide.
    bushRadius: 0.55,
  },
  gron: {
    // Where Gron stands, station-local like the bush: a couple of strides
    // from it, further from the store's wall and toward the road, turned
    // to face the pumps where raiders arrive.
    at: { x: -6.2, z: -9.6 },
    // How close E must be to talk to him; when the bush is in reach too,
    // the nearer of the two answers.
    reach: 2.4,
    // He blocks like a post this wide.
    radius: 0.4,
  },
  stand: {
    // Where the Bull Valley Cabbage Stand is set up on the spawn Citgo's
    // lot, station-local like the bush: on Gron's side, beside the lot lamp
    // at the store's back corner (world.ts STATION_LAMPS), toward the
    // pumps, turned to face them. Scenery: it only blocks.
    at: { x: -3.6, z: -17.2 },
    // It blocks as a capsule along its table (assets.ts CABBAGE_STAND):
    // this far either side of its middle, this wide.
    halfLength: 1.0,
    radius: 0.75,
  },
  npcs: {
    // How close you must stand for Matthew Marx or David Carlsten to glow
    // and answer E. Marx reads by the tailgate, in boarding range, so this
    // stays small: step off him and E boards. Carlsten stands behind the
    // counter, which keeps you about 1.6 m from him.
    reach: 1.8,
  },
  moab: {
    // Where Moab Coldë's horse stands at every Citgo, station-local like
    // the bush: under the road sign (FUEL_LAYOUT.signDistance, signAlong in
    // assets.ts), a stride in from its pole toward the pumps, standing
    // broadside to the pump island. Moab stands with his back to its flank
    // (figure.ts MOAB_BESIDE), facing the island where raiders arrive.
    at: { x: 8.6, z: 6.2 },
    // How close E must be to talk to him, from the middle of the horse.
    reach: 2.8,
    // The horse blocks as a capsule along its spine: this far either side
    // of its middle, this wide.
    halfLength: 0.9,
    radius: 0.45,
    // Moab himself blocks like a post this wide.
    standRadius: 0.4,
  },
  maze: {
    // The corn maze across Lake Avenue from the spawn Citgo, station-local
    // like the bush: its corner nearest the station, 20 m past the road's
    // centreline and a little down the road, clear of the two ponds behind
    // it. maze.ts SHINING_MAZE is the layout, stretched to `size` (along
    // the road, and away from it).
    at: { x: 35, z: 30 },
    size: { along: 200, across: 86 },
    // Corn over a raider's head, and over the truck bed's eye.
    wallHeight: 3.6,
    // How thick each wall stands (thin enough that the walls drawn half a
    // pitch apart still leave a path between them), and how far its
    // stalks sink into the ground so a slope never shows daylight under it.
    wallThickness: 1,
    wallSink: 0.5,
    // No wall piece runs longer than this, so the corn follows the ground.
    pieceLength: 3,
    // Trees keep this far off the corn.
    treeClear: 6,
    // The CORN MAZE! sign, station-local: on the verge by the maze's near
    // corner, turned to face back across the road to the pump island.
    sign: { x: 26, z: 24 },
    // The ENTER! sign, station-local: just out from the gate (maze.ts
    // mazeGates, halfway along the near end), beside it on the side away
    // from the road, facing back down the road with its arrow at the gate.
    enterSign: { x: 82, z: 25 },
    // The worn mud trail, this wide: from the maze's heart out through the
    // gate (maze.ts mazeWalk), then on through these station-local points,
    // past the ENTER! sign and the CORN MAZE! sign, to tuck under the road.
    trailWidth: 1.2,
    trailOut: [
      { x: 78, z: 22 },
      { x: 40, z: 23 },
      { x: 17, z: 31 },
    ],
    // Each sign blocks along its board, post to post, this wide.
    signRadius: 0.12,
    // Sodium lamps all the way round the outside (maze.ts perimeterSpots):
    // this far off the corn, about this far apart, and none within `clear`
    // of the gate, either sign, or the trail out.
    lamps: { out: 3, spacing: 25, clear: 5 },
    // The portal at the maze's heart (maze.ts mazeHeart): step within
    // `radius` of its middle and it puts you on the trail just outside the
    // gate (`exit`, station-local), facing the gate.
    portal: { radius: 0.9, exit: { x: 78, z: 23 } },
    // Berry bushes round the portal, on an ellipse this many metres across
    // the court and along it (maze.ts ringSpots). Each gives every account
    // one berry a day, like the bush at the spawn Citgo (CONFIG.daily).
    bushes: { count: 6, across: 2.6, along: 5 },
  },
  // The Caretaker: one floating shade that walks the corn maze's paths
  // (caretaker.ts, sharedraid.ts rule 15). It patrols out to a random
  // corner of the maze and back to the heart, by turns, at patrolSpeed.
  // A raider on foot in the maze it can see within sightRange, or one
  // within senseRadius whether it can see them or not, it hunts at
  // huntSpeed (faster than a walk, slower than a sprint), and gives up
  // forgetSeconds after it last saw them. Its touch at touchRadius is a
  // strike, as a shadowman's. Two raiders' beams on it at once for
  // burnSeconds unmake it, and it forms again at the heart respawnSeconds
  // later; one beam alone does nothing. It floats hover metres over the
  // paths, and a beam is aimed at chestHeight over the holder's feet.
  caretaker: {
    patrolSpeed: 2.2,
    huntSpeed: 6.5,
    sightRange: 18,
    senseRadius: 3,
    forgetSeconds: 4,
    touchRadius: 1.1,
    burnSeconds: 1.2,
    respawnSeconds: 180,
    hover: 0.5,
    chestHeight: 1.6,
    // How far its body keeps off the corn when it cuts a corner, and how
    // often a hunt works out its way through the paths again, in seconds.
    clearance: 0.45,
    rethinkSeconds: 0.5,
  },
}
