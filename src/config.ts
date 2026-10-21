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
    // Past this many metres from the player the fog has swallowed
    // everything (3/fogDensity), so what moves on its own out there
    // (Moab's fire, the dishes, the wreck's hazards) is not stepped, and
    // Marx's lamps stop rendering their shadow maps.
    liveRadius: 190,
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
    // Walking with the phone up, dialing a Citgo portal.
    phoneSpeedScale: 0.6,
    mouseSensitivity: 0.0023,
    // How close a pickup must be for E to take it.
    pickupReach: 2.6,
    // The body's radius, for the store walls.
    radius: 0.3,
  },
  // The Book of Shadows (book.ts): how near a raider must come for each
  // place to be written in it (world.ts bookSights), in metres, and how
  // near a shadow.
  book: {
    reach: {
      citgo: 25,
      stand: 7,
      wreck: 12,
      // From the middle of the plaza's building, out over its lot.
      plaza: 30,
      // From the middle of the array, which runs some 70 m a side.
      dishes: 45,
      // Past the field's own edge.
      donutField: 4,
      // Past the corn, either side of the maze.
      maze: 8,
      heart: 12,
      keep: 40,
      // Past the rim, from the island's middle.
      castle: 90,
    },
    sightRange: 25,
  },
  shadowmen: {
    // Crossings: this many shadowmen at once in a bubble around the player.
    count: 12,
    // They spawn on this ring, well out in the fog, cross toward a point
    // within crossRadius of the player, and are dropped past despawnRadius.
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
    // Nothing touches at once: one in reach stands and winds up for
    // windupSeconds, then lunges, and the lunge lands only on a raider
    // still within reachScale times its touch. A beat to step away.
    windupSeconds: 0.35,
    reachScale: 1.25,
    // Citgo forecourts are havens: shadowmen turn aside at the lights and
    // nothing can touch you inside.
    havenRadius: 60,
    // The static after a strike, in real seconds (actions.ts times it by the
    // wall clock, never the frame-capped game time).
    strikeSeconds: 1.6,
    // A shadowman held this many seconds in the flashlight's beam bursts;
    // out of the beam the count runs back down at the same rate. The beam
    // is aimed at a point this far over the ground it stands on.
    burnSeconds: 0.5,
    chestHeight: 1.4,
    // One that bursts leaves this many dimes (10¢ each) lying where it
    // was, drawn evenly between the two (drops.ts dimesFor).
    dimes: { min: 3, max: 20 },
    // Shadow spiders: twice a shadowman's height, crossing among them as
    // one of the crowd. Each new one in a bubble is a spider by `chance`,
    // or by `nearWaterChance` where it comes in, or the raider stands,
    // within waterRadius metres of water (waterside.ts), and never more
    // than maxPerBubble round one raider. A beam takes burnScale times a
    // shadowman's burnSeconds to burst one, aimed at aimHeight over the
    // ground, where its body hangs. It crosses a little slower than a
    // shadowman, rushes a little faster, touches from further off, and
    // leaves one $20 bill (drops.ts TWENTY) where it burst.
    spider: {
      chance: 0.03,
      nearWaterChance: 0.35,
      waterRadius: 120,
      maxPerBubble: 3,
      burnScale: 2,
      // Its burst, against a shadowman's.
      burstScale: 2,
      aimHeight: 2.8,
      speedMin: 5,
      speedMax: 8,
      rushSpeed: 13,
      touchRadius: 2.4,
    },
    // A spider that bursts breaks into brood.min to brood.max spiderlings,
    // scattered up to `scatter` metres round where it burst: a quarter of
    // a spider's size (`scale`), quicker, rushing anyone within rushRadius,
    // touching closer, bursting in burnSeconds in a beam, aimed at
    // aimHeight. Each leaves a few dimes (`dimes`), never a tombstone, and
    // none breaks again.
    spiderling: {
      brood: { min: 3, max: 8 },
      scatter: 2.5,
      scale: 0.25,
      // Its burst, against a shadowman's.
      burstScale: 0.5,
      speedMin: 8,
      speedMax: 11,
      rushRadius: 40,
      rushSpeed: 14,
      touchRadius: 0.9,
      burnSeconds: 0.2,
      aimHeight: 0.5,
      dimes: { min: 1, max: 3 },
    },
    // What shows through the fog (a spider's eyes, the joint's violet aura)
    // fades out between these distances from the raider, so it is gone
    // before the spawn ring and the despawn radius: none is ever seen to
    // come or go.
    glowFade: { near: 200, far: 290 },
    // In the shared valley the server steps them this many times a second
    // and sends each step; clients draw them between the last two.
    tickHz: 10,
  },
  // Geometrie, the raider's hit points (health.ts, sharedworld.ts rule
  // 24): `base` at level 1 and `perLevel` more for each level after
  // (progression.ts), rounded to `round`. Each shadow's touch takes its
  // own hit (wards.ts, CONFIG.damage), cut by the raider's wards. A touch
  // that leaves some lets the raider alone for graceSeconds where they
  // stand; the last one shatters their geometrie (a strike: the static and
  // the corpse run), and they come to whole. A Citgo forecourt makes them
  // whole, and anything smoked, drunk or swallowed gives back its share
  // (items.ts healsPct). A hit fills the view red and shakes it for
  // shakeSeconds, up to shakeMetres off.
  health: {
    base: 1000,
    perLevel: 40,
    round: 10,
    graceSeconds: 3,
    shakeSeconds: 0.45,
    shakeMetres: 0.07,
  },
  // What each shadow's touch takes off geometrie before any ward
  // (wards.ts damageOf), give or take `spread` either way on the valley's
  // roll, so every raider sees the same number.
  damage: {
    spread: 0.1,
    spiderling: 140,
    man: 320,
    spider: 480,
    shade: 420,
    caretaker: 750,
    warden: 1100,
  },
  // The wards (wards.ts): the corner matched to a shadow cuts its touch by
  // `matching` at full strength, the strongest other corner by `other`,
  // never past `cap` in all.
  wards: {
    matching: 0.6,
    other: 0.1,
    cap: 0.75,
    // The tetrahedron turns once in this many seconds (hud.ts).
    turnSeconds: 14,
    // Each level fades this much a second (a level runs from 0 to 1), so
    // a full one fades out in 1 / rate seconds: high in four minutes,
    // stimulated in three, drunk in five, a trip in four (wardlevels.ts).
    // Per-item doses live in src/items.ts.
    fadePerSecond: {
      high: 1 / 240,
      stimulated: 1 / 180,
      drunk: 1 / 300,
      tripping: 1 / 240,
    },
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
    // How bright the beam is on the bathroom's faces, which take no real
    // light (bathglow.ts).
    bathLevel: 2.2,
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
  // The moment anything smoked or drunk is used, the view blurs (trip.ts,
  // trails.ts).
  trip: {
    // The blur each use starts with, fading out over this long.
    blurSeconds: 1,
    // The blur's reach at its height, in internal pixels.
    blurRadius: 3,
  },
  // What the wards do to the view (wardview.ts, trails.ts). Each works at
  // full strength from `full` up and in proportion below it, so it thins
  // out as its ward fades. Drunk trails the view; high saturates its
  // colours and trails it a little; stimulated sharpens it. A trip's
  // sights are its own.
  wardView: {
    // A ward at or past this level works on the view at full strength.
    full: 0.5,
    // How much of the last frame each frame keeps while trails are full:
    // nearer 1, longer trails.
    persistence: 0.86,
    // The share of full trails a full high adds to the drunk's.
    highTrails: 0.3,
    // Saturation at a full high: 1 keeps the colours, 1.9 nearly doubles
    // how far each sits from grey.
    saturation: 1.9,
    // The unsharp mask at a full stimulated: how much of the difference
    // from its neighbours each pixel gains, and how far off they sit, in
    // internal pixels.
    sharpen: 1.6,
    sharpenRadius: 1,
  },
  // What the wards do besides warding (buffs.ts), each scaled by its
  // level from 0 to 1. High reaches the flashlight further and wider (a
  // full high, half again); stimulated quickens the sprint (a full one,
  // 35% faster). Passing something to a raider within passReach metres doses
  // them in full and heals them, and doses the giver at shareScale too.
  buffs: {
    beamPerHigh: 0.5,
    sprintPerStimulated: 0.35,
    passReach: 3,
    shareScale: 0.5,
  },
  // Citgos visited, Citgo portals and fast travel (citgos.ts, portals.ts,
  // sharedworld.ts rule 28). A raider within visitReach of a station's pump
  // island stands at that Citgo: it is visited, it is the last Citgo they
  // stood at, and fast travel leaves from there. The phone (Q) dials a
  // portal for dialSeconds, then it opens `ahead` metres in front of the
  // raider, facing them, and its twin opens at their last Citgo. Anyone on
  // foot who walks within `radius` of either end's middle comes out `exit`
  // metres in front of the other, facing away from it. Each account keeps
  // one open at a time, for lifeSeconds. Every lot has a ring of `slots`
  // portal ends, `ringRadius` metres round `ring` (station-local like the
  // bush: past the pump island's far end, clear of Moab and the lamps),
  // each facing out; fast travel sets a raider down in the ring's middle.
  // After a portal or fast travel, no portal takes a raider for
  // graceSeconds, whatever stands where they come out.
  portal: {
    dialSeconds: 1.5,
    graceSeconds: 1,
    ahead: 3,
    radius: 0.9,
    exit: 2.2,
    lifeSeconds: 180,
    ring: { x: 2, z: 13.5 },
    ringRadius: 3.5,
    slots: 6,
    visitReach: 25,
  },
  spawn: {
    // The spawn sits this far from the pump island, toward the truck: on
    // the lot, between the pumps and the road sign.
    offset: 5,
  },
  music: {
    // The valley's music (music.ts): the element's volume at the setting's
    // top, kept well under the valley so it sits beneath everything.
    volume: 0.5,
    // Seconds it takes to come up from silence when it starts.
    fadeInSeconds: 4,
  },
  sfx: {
    // The valley's sounds (sfx.ts): the loudness at the setting's top.
    volume: 0.8,
    // Nothing further from the raider than this, in metres, is heard.
    hearing: 60,
    // At most this many spiderlings skitter at once, the nearest.
    skitters: 3,
    // A placed sound is at full loudness this close, in metres, and falls
    // away past it this fast (a Web Audio inverse model).
    refDistance: 4,
    rolloff: 1.2,
    // How far a playback rate (pitch) wanders, either way, per play.
    jitter: 0.06,
  },
  store: {
    // A new account's wallet, in cents (worker/packs.ts).
    startingCash: 4000,
    // Units of every item on each Citgo's shelves when the day turns.
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
    // main menu.
    revealFadeMs: 400,
    imageSrc:
      '/applied-sciences-and-phantasms-working-division-flourescent.png',
    audioSrc: '/audio/northern-information.mp3',
  },
  epigraph: {
    // "Based on true events." between the colophon and the main menu: the
    // line fades up, holds and fades out in silence over the colophon's
    // black, then the black lifts onto the menu. A gesture skips it.
    fadeInMs: 1400,
    holdMs: 2200,
    fadeOutMs: 1400,
    skipFadeMs: 200,
    skipAudioFadeMs: 300,
    revealFadeMs: 400,
  },
  logo: {
    // The game's own logo atop the main menu, straight after the colophon:
    // it fades up over fadeInMs, silent (the valley's music starts under
    // it), while the colophon's cue fades out over skipAudioFadeMs.
    fadeInMs: 2000,
    skipAudioFadeMs: 300,
    imageSrc: '/bull-valley-shadow-wars.png',
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
    // Marx's headlights burn shadowmen like a flashlight (shadowmen.ts
    // headlightBeam): a cone from the lamps, `nose` metres ahead of the
    // truck's middle and `height` up, `range` long and `halfAngle` radians
    // off its axis. The valley aims it from where a client within `reach`
    // of the truck last said it was, and forgets a word older than staleMs.
    headlights: {
      reach: 400,
      range: 30,
      halfAngle: 0.45,
      height: 0.95,
      nose: 2.95,
      staleMs: 1000,
    },
    wanderMetres: 6000, // how far the outbound joyride runs
    // Matthew Marx's day (marx.ts): he reads at the tailgate this long,
    // then does donuts this long, over and over. Climbing into the bed
    // starts a countdown this long before he leaves (marx.ts board): on the
    // joyride, or wherever the first one in picked on the map (charter).
    // With no one else in the valley no countdown shows, and he leaves as
    // soon as the pick is made; this long is only how long he waits for
    // one.
    readSeconds: 300,
    donutSeconds: 300,
    countdownSeconds: 60,
    // The countdown shows to whoever is in the bed or this close by.
    countdownReach: 25,
    // The valley never knows the roads: it reckons a drive by road at most
    // roadFactor times the straight line, plus slackSeconds, and a drive
    // home from the donut field at donutHomeSeconds.
    roadFactor: 2,
    slackSeconds: 20,
    donutHomeSeconds: 60,
    // The donuts (donuts.ts): crossing Lake Avenue to the field between
    // the road and the corn maze. `field` is station-local like
    // CONFIG.maze.at: across the road from the lot, short of the maze's
    // near end and its mud trail out.
    donuts: {
      field: { x: 60, z: -5 },
      radius: 22,
      speed: 9, // m/s
      metres: 12000, // about 20 minutes of donuts, more than he ever does
      // Each loop's radius, drawn per set.
      loop: { min: 5, max: 10 },
      // How far the nose swings into the turn at the tightest loop.
      drift: 0.6,
      // What the rear wheels throw while he tears up the field (donutwake.ts):
      // up to `perSecond` clods of grass and dirt at full speed, each
      // flung back off the tyre at up to `throw` m/s and `lift` m/s up,
      // landing and lying `life` seconds; never more than `max` at once.
      spray: { perSecond: 160, throw: 6, lift: 4.5, life: 1.8, max: 400 },
      // The ruts the wheels cut, on a sheet over the field `px` pixels a
      // side: each pass darkens them by `alpha`, `width` metres wide, and
      // every `healSeconds` the grass takes back `heal` of what is there.
      ruts: { px: 512, alpha: 0.35, width: 0.32, healSeconds: 5, heal: 0.02 },
    },
    // Marx's radio (truckradio.ts): Day of Justice out of the cab while the
    // truck rolls, as cut in the bed, fading and losing its highs with the
    // distance, so from the Citgo only the lows of his donuts carry.
    radio: {
      volume: 0.9,
      near: 4,
      rolloff: 0.45,
      far: 55,
      openHz: 18000,
      floorHz: 180,
      hearing: 260,
      fade: 80,
    },
  },
  // What the valley holds a raider to (sharedworld.ts): a take, a buy, a
  // berry, a body looted, the bed climbed into, all from where the
  // raider's last state frame put them. Looser than the client's own
  // reach, since a frame is up to a tenth of a second old and a sprint
  // covers a metre in that.
  valleyReach: {
    // A pickup, a drop, a berry bush or a body, in metres.
    item: 10,
    // The truck's bed, parked at home or come to a whistle.
    truck: 24,
    // A whistle reckons the drive from where the client says the truck
    // is; further than this from home it is reckoned from home, so no
    // whistle can send Marx on a drive from the far side of the valley.
    callFrom: 600,
  },
  net: {
    // The valley server. State frames go out at most this often, and only
    // when something changed; peers are drawn this far behind the present
    // so two frames always bracket the moment being drawn.
    sendHz: 10,
    interpolateMs: 150,
    // How long Dial-Up's modem waits on the first connection before it
    // says NO CARRIER.
    connectTimeoutMs: 2000,
    // How long the 3D valley tries to reach the valley again after a drop
    // before the overlay offers the way back to the menu.
    giveUpMs: 60_000,
    // Clock-offset pings once online.
    pingMs: 10000,
    // The valley lets go of a socket it has heard nothing from (no ping, no
    // state) for this long, so a tab that vanished without closing leaves
    // no figure standing. Generous: a background tab's timers can run as
    // seldom as once a minute, and one let go too soon only reconnects.
    silentMs: 120_000,
    // A ping the valley has not answered in this long means the line is
    // dead though the socket never closed (a network change, a sleep): the
    // client lets it go and reconnects. Measured from the ping, so a
    // background tab's slow timers never count against it.
    deadMs: 8000,
    // A raider whose socket went stands where they were for this long
    // before everyone hears them leave, so a reconnect inside it takes
    // their place back and no one sees them go.
    lingerMs: 20_000,
    // How long the "signed out" line sits in the chat log before the page
    // reloads to the sign-in card.
    signedOutReloadMs: 2500,
  },
  cabbage: {
    count: 48,
    // Under the dish array behind the spawn Citgo (cabbages.ts
    // placeDishCabbages): this many, each under its own dish, between
    // `near` and `far` metres off the pedestal: past the concrete pad
    // (assets.ts DISH.pad) and inside the reflector's rim.
    underDishes: { count: 8, near: 2.4, far: 3.8 },
  },
  // Items dropped from the pack (drops.ts).
  drops: {
    // How far ahead of the raider a drop lands, in metres.
    ahead: 1.2,
    // The circle drops from one spot are spread round, in metres.
    scatter: 0.35,
    // How many of what the valley spilled (dimes, a $20, bullion) lie at
    // once; past it the oldest goes, so an evening's bursts never fill the
    // world. A raider's own drops lie until the day turns.
    spilledMax: 300,
  },
  // The tombstones burst shadowmen leave (graves.ts).
  graves: {
    // How many stand at once in the valley; past it the oldest goes.
    max: 100,
    // How far from where the shadowman burst its stone stands, in metres,
    // so it never covers the dimes.
    offset: 0.9,
  },
  // What a raider struck leaves where they fell (corpses.ts).
  corpses: {
    // How close your body must be for E to take your things back.
    reach: 2.2,
  },
  // The stash: the account's locker in the back room of every Citgo
  // (stash.ts).
  stash: {
    // How close the lockers must be for E to open yours.
    reach: 1.8,
    // The valley opens the locker only to a raider whose last state frame
    // put them within this of a station's pump island; the back room is
    // about 17 m behind it.
    stationReach: 24,
  },
  // The laptop on the card table in the Citgo bathroom (laptop.ts): a
  // text editor over a pretend file system every raider shares.
  laptop: {
    // How close the laptop must be for E to sit down at it.
    reach: 1.5,
    // The valley opens the files only to a raider whose last state frame
    // put them within this of a station's pump island, as the locker.
    stationReach: 24,
    // A file's name, in characters, and its text.
    nameMax: 32,
    bodyMax: 8000,
    // How many files one account may keep.
    perAccount: 16,
    // The screen's light, the only light in the bathroom (bathglow.ts):
    // its colour, how bright, and how far it reaches before it is gone.
    glow: { color: '#3f6dff', level: 2.4, reach: 4.5 },
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
    // pumps, turned to face them. It blocks, and every account keeps its
    // own outpost there (stand.ts).
    at: { x: -3.6, z: -17.2 },
    // It blocks as a capsule along its table (assets.ts CABBAGE_STAND):
    // this far either side of its middle, this wide.
    halfLength: 1.0,
    radius: 0.75,
    // How close its middle must be for E to open it.
    reach: 2.8,
    // The valley tends a raider's stand only when their last state frame
    // put them within this of its middle: generous, since frames lag.
    tendReach: 8,
    // A collect earns the stand's XP (progression.ts XP.stand) once for
    // every whole this many cents it pays out.
    xpCents: 25,
    // What goes on the table: the valley's own produce.
    goods: ['cabbage', 'berries'],
    // Each level, the first the one every account starts at: how many
    // goods the table holds (`shelf`), what it earns an hour in cents with
    // the table full (`rate`; a part-full table earns its share), how many
    // hours of that it banks before it stops (`capHours`), and what the
    // upgrade to it costs (cents, and goods out of the pack). The goods put
    // out never run down: the rate is flat for the level.
    levels: [
      { shelf: 6, rate: 30, capHours: 12, price: null },
      {
        shelf: 10,
        rate: 60,
        capHours: 14,
        price: { cash: 1000, items: { cabbage: 4, berries: 0 } },
      },
      {
        shelf: 16,
        rate: 100,
        capHours: 18,
        price: { cash: 2500, items: { cabbage: 8, berries: 4 } },
      },
      {
        shelf: 24,
        rate: 150,
        capHours: 24,
        price: { cash: 6000, items: { cabbage: 12, berries: 8 } },
      },
    ],
  },
  // Castle Entropy and its moat (moat.ts, castle.ts, castlesite.ts):
  // straight out the spawn Citgo's front door, across Lake Avenue past the
  // donut field, clear of the corn maze. The moat is cut
  // into the terrain itself (moat.ts carve), an irregular pentagon round an
  // island no one reaches yet, the castle floating over it and made anew
  // every Central day.
  castle: {
    // The island's middle, station-local like the wreck: +x is out the
    // store's door toward the road.
    at: { x: 230, z: -5 },
    // The pentagon's turn in the world, radians.
    yaw: 0.35,
    moat: {
      // The island's middle radius, how far each corner may wander from it
      // (a share), and how far each may turn off true (radians).
      island: 34,
      wobble: 0.16,
      twist: 0.16,
      seed: 0xe471,
      // Across the channel and down it, from the lowest of the rim.
      width: 30,
      depth: 30,
      // Trees, poles and pickups keep this far off the outer edge.
      clear: 12,
    },
    // The fire escapes on the outer walls (moat.ts fireEscapes): the sides
    // that carry one, how wide a flight runs (the strip is two), about how
    // much each climbs, how steep (rise over run), and how deep a landing
    // is.
    stairs: {
      sides: [0, 2, 3],
      width: 1.1,
      rise: 3,
      slope: 0.7,
      landing: 1.6,
    },
    // The cranes on the outer rim, leaning out over the moat.
    cranes: 4,
    // The castle's base, this far over the highest ground anywhere on the
    // island (its rock hangs under that, well clear), and how it bobs.
    float: 40,
    bob: { metres: 0.8, seconds: 11 },
    // How many of each it is built of (castle.ts castleOf), on cells this
    // wide.
    cell: 6,
    masses: { min: 9, max: 15 },
    // No mass stacks higher than this over the base.
    stack: 44,
    // The share of the masses that are the church's stone (the keep always
    // is), and how far a concrete one swells out of its box at most.
    stone: 0.5,
    swell: 0.4,
    // The cathedral's spire on the keep, how tall; the rest, how many in
    // all; the spomeniks' forms on the concrete roofs, how many.
    cathedral: { min: 40, max: 60 },
    spires: { min: 8, max: 16 },
    forms: { min: 3, max: 6 },
    // Coming apart (crumble.ts): each piece that can fall, in each round
    // of `cycle` seconds, falls by a draw of `share`, crumbling for
    // `crumble`, gone for `gone`, growing back for `regrow`.
    ruin: { cycle: 100, share: 0.35, crumble: 5, gone: 30, regrow: 14 },
    // The bits always falling off it (`count` of them, each `life`
    // seconds long, a share `fromRock` off the rock underneath), and the
    // chunks a crumbling piece throws (`chunks` of them, breaking off over
    // `chunkSpread` seconds, each falling `chunkLife`), in metres and
    // seconds.
    fragments: {
      count: 140,
      life: 4,
      fromRock: 0.3,
      gravity: 9.8,
      drift: 0.6,
      size: { min: 0.2, max: 0.7 },
      chunks: 36,
      chunkSpread: 3,
      chunkLife: 4,
      chunkSpeed: 3,
      chunk: { min: 0.7, max: 2.2 },
    },
    lighthouse: {
      // Turns a minute, how far each beam reaches, its colour.
      rpm: 5,
      beamLength: 420,
      color: '#4aa8ff',
    },
  },
  // Falling (fall.ts): the feet leave the ground when it drops away more
  // than `step`, and fall at `gravity` m/s². They climb onto a deck up to
  // `climb` over them (a store's floor over its slope); a deck higher than
  // that is a ceiling they walk under (the flight over a flight). A
  // landing from `safe` metres hurts, scaled to all of a raider's
  // geometrie at `lethal` (two stories) and past it.
  fall: {
    step: 0.6,
    climb: 2,
    gravity: 22,
    safe: 3,
    lethal: 7,
  },
  wreck: {
    // The green BMW nosed into a tree beside the spawn Citgo, station-local
    // like the bush: on the station's side of Lake Avenue, across the road
    // from the corn maze's near corner, in the grass just past the lot's
    // end, where it left the road for the tree. `toward` is the way its
    // nose points, at the tree (assets.ts WRECK). Scenery: it only blocks.
    at: { x: 6.5, z: 27 },
    toward: { x: 3.5, z: 25.5 },
    // It blocks as a capsule down its length (this far either side of its
    // middle, this wide), and the tree like a post.
    halfLength: 1.6,
    radius: 0.9,
    // Trees keep this far off its middle.
    treeClear: 6,
  },
  lonePine: {
    // The lone pine among the dishes behind the spawn Citgo, station-local
    // like the dishes: between the second and third rows, a little off the
    // middle. No other tree grows inside the array. Its shape is a scatter
    // tree's (world.ts buildTrees).
    at: { x: -44.65, z: -12.47 },
    trunkH: 3.9,
    canopyH: 7.5,
    canopyR: 2.6,
    tint: 0.4,
    // Spunky's grave at its foot, `offset` metres off the trunk toward the
    // station and facing it, blocking like a small post. The carving is
    // trade dress (graveart.ts), so it lives here and not in COPY.toml.
    grave: {
      heading: 'HERE LIES',
      name: 'SPUNKY',
      seed: 0x5b0c4e,
      offset: 2.2,
      radius: 0.35,
      // Cabbages keep this far off the stone and its mound.
      clear: 1.6,
    },
    // The cabbage patch round it (cabbages.ts placeCabbagesAround):
    // between `near` and `far` metres off the trunk, each at least `clear`
    // off a dish pedestal, past its pad.
    cabbages: { count: 14, near: 1.4, far: 5.5, clear: 2.4 },
  },
  dishes: {
    // The dish array behind the spawn Citgo (assets.ts DISH), station-local
    // like the bush: `rows` rows back from the store's back wall, the first
    // `first` metres from the pump island, each `cols` dishes across,
    // `spacing` apart, wider than a reflector so none ever touch however
    // they turn. Scenery: each pedestal blocks like a post this wide.
    rows: 6,
    cols: 6,
    first: -24,
    spacing: 13,
    radius: 1.4,
    // Trees keep this far off each pedestal: clear of the reflector.
    treeClear: 6,
  },
  stripMall: {
    // Bull Valley Plaza, the dead strip mall beside the spawn Citgo
    // (stripmall.ts), station-local like the bush: the middle of its
    // front wall, on the side away from the wreck and the maze, its lot
    // running on from the Citgo's past the cabbage stand, and its alley
    // behind clear of the dish array. Scenery: it only blocks.
    at: { x: -8, z: -60 },
    // The back room's locked door swings open for a raider who may pass
    // (keys.ts) once they are this close to it, in metres; E this close
    // without the key only rattles it.
    doorReach: 2.5,
  },
  dealer: {
    // How close Erwin von Dutch in the Golden Wok (dealer.ts, placed at
    // stripmall.ts STRIP_MALL.dealer) must be for E to deal with him.
    reach: 2.2,
    // What he counts each unit of a raider's goods at, as a share of its
    // Citgo shelf price: a little under.
    rate: 0.9,
    // The valley sells only to a raider whose last state frame put them
    // within this of him: generous, since frames lag.
    dealReach: 8,
    // He blocks like a post this wide.
    radius: 0.35,
  },
  // Idle expeditions from Bull Valley Dial-Up (expeditions.ts,
  // sharedworld.ts rule 30): each run's minutes out, the level it opens
  // at, the ward that keeps it safe (null for none needed), the chance it
  // comes back hurt with that ward at nothing, how hard it hurts (a share
  // of whole geometrie, never the last point), the XP it earns home, and
  // what it brings back: each roll a kind (cash kinds pay the wallet), how
  // many, and the chance it comes at all.
  expeditions: {
    runs: {
      ride: {
        minutes: 15,
        level: 1,
        ward: null,
        risk: 0,
        hurt: 0,
        xp: 1,
        loot: [
          { kind: 'dimes', min: 5, max: 20, chance: 1 },
          { kind: 'berries', min: 1, max: 1, chance: 0.25 },
        ],
      },
      corn: {
        minutes: 60,
        level: 1,
        ward: 'drunk',
        risk: 0.35,
        hurt: 0.25,
        xp: 4,
        loot: [
          { kind: 'dimes', min: 10, max: 40, chance: 1 },
          { kind: 'berries', min: 1, max: 3, chance: 0.8 },
          { kind: 'cabbage', min: 1, max: 3, chance: 0.8 },
          { kind: 'gold-bullion', min: 1, max: 1, chance: 0.05 },
        ],
      },
      undercroft: {
        minutes: 240,
        level: 10,
        ward: 'tripping',
        risk: 0.5,
        hurt: 0.4,
        xp: 15,
        loot: [
          { kind: 'dimes', min: 30, max: 120, chance: 1 },
          { kind: 'twenty', min: 1, max: 1, chance: 0.3 },
          { kind: 'gold-bullion', min: 1, max: 1, chance: 0.2 },
          { kind: 'lsd', min: 1, max: 2, chance: 0.2 },
        ],
      },
    },
    // The matching ward at its fullest takes this share off the risk.
    wardCut: 0.8,
    // A run that comes back hurt brings this share of each roll home.
    hurtKeeps: 0.5,
  },
  // The tunnel shades in the Undercroft (tunnelshades.ts): each kind's
  // drift round its lair and its hunt (m/s; the walk is 4.2), how far it
  // sees and feels, its touch, the seconds a beam must hold it, and the
  // seconds before it forms again. The Warden keeps the deep chamber.
  tunnel: {
    shade: {
      patrolSpeed: 1.1,
      huntSpeed: 3.4,
      sightRange: 14,
      senseRadius: 2.5,
      touchRadius: 0.9,
      burnSeconds: 0.9,
      respawnSeconds: 90,
      patrolRadius: 8,
      chestHeight: 1.2,
      // Beams held burnSeconds this many times burst it; one, for a shade.
      hits: 1,
      // A hit that leaves it standing: gone this long, then formed again
      // somewhere in its room at least blinkFrom metres from every raider.
      blinkSeconds: 0,
      blinkFrom: 0,
    },
    // The Warden roams the whole deep chamber through its ruins, hunts
    // only a little slower than a walk, and takes four hits, each a beam
    // held burnSeconds on it: a hit throws it into the dark, and it forms
    // again elsewhere among the broken walls, its wounds kept until it
    // bursts.
    warden: {
      patrolSpeed: 1.6,
      huntSpeed: 3.8,
      sightRange: 22,
      senseRadius: 3.5,
      touchRadius: 1.4,
      burnSeconds: 2.2,
      respawnSeconds: 300,
      patrolRadius: 30,
      chestHeight: 1.8,
      hits: 4,
      blinkSeconds: 1.6,
      blinkFrom: 9,
    },
    forgetSeconds: 4,
    rethinkSeconds: 0.75,
    clearance: 0.5,
  },
  undercroft: {
    // Where the Undercroft lies (undercroft.ts): this many metres in from
    // the survey square's low corner, well past the valley's edge, and
    // this high over the highest ground under it, so nothing on the
    // surface ever stands in it.
    inset: 60,
    lift: 60,
    // How near the trapdoor in the Video Vault's office, or the ladder's
    // foot below, E climbs.
    climbReach: 1.6,
  },
  quests: {
    // How near the heart of the corn maze a raider's last state frame
    // must put them for the valley to take the rose laid there (quests.ts),
    // in metres: past the berry bushes' ring, since frames lag.
    heartReach: 10,
    // How near the portal E lays it.
    layReach: 4,
  },
  emotes: {
    // A raider within this many metres of one who emotes (emotes.ts) gets
    // the quiet line in their log; anyone further off only sees it.
    seenRadius: 40,
  },
  npcs: {
    // How close you must stand for Matthew Marx or David Carlsten to glow
    // and answer E. Marx reads by the tailgate, in boarding range, so this
    // stays small: step off him and E boards. Carlsten stands behind the
    // counter, which keeps you about 1.6 m from him.
    reach: 1.8,
  },
  // The slurms (slurms.ts): black slugs dropping off a Citgo's dripline,
  // and David Carlsten coming out with his bat to smash them. Scenery on
  // the shared clock, the same for everyone; they never touch a raider.
  slurms: {
    // Time is cut into slots this long, and each slot at each station has
    // one drop, starting up to `jitterSeconds` into it: the drops come
    // 30 to 90 seconds apart, and one is always over before the next.
    slotSeconds: 60,
    jitterSeconds: 30,
    // How often a drop is more than one slurm, and the most at once.
    multiChance: 0.35,
    maxCount: 4,
    // Several fall from along this much of the edge, a beat apart.
    spread: 1.6,
    stagger: [0.15, 0.6],
    // Metres a second squared, off the eave or the canopy.
    gravity: 9.8,
    // Each crawls off this fast for this long, then rears and snaps.
    crawlSpeed: 0.12,
    crawlSeconds: 2.5,
    // The tooth slides out and back in once a period.
    toothPeriod: [1.1, 2.2],
    // Carlsten sees the first land and comes out after this long, walking
    // brisk (he has done this before), and stands this far off each one.
    reactSeconds: 1.2,
    walkSpeed: 2.1,
    standOff: 0.8,
    // His swing: the bat raised, brought down (the slurm bursts at the
    // end of it), and a beat to recover before the next.
    windupSeconds: 0.45,
    smashSeconds: 0.18,
    recoverSeconds: 0.35,
    // After the last he curses, and goes back in this long after.
    curseDelay: 0.4,
    lingerSeconds: 1.4,
    // A raider's foot gets the last one before he does: he stops, thanks
    // them this long after, and turns back in this long after that.
    thanksDelay: 0.3,
    thanksSeconds: 1.2,
    // A squashed slurm lies as a black splat this long, then fades.
    splatSeconds: 5,
    // How close you must be to hear him curse in the log.
    hearRadius: 30,
    // A raider's feet this close (and this near its height) squash a
    // slurm that is down and crawling, the Citgo's and the moat's alike.
    treadReach: 0.5,
    treadHeight: 0.9,
    // The moat's (moatslurms.ts): a drop every slot, off the rim, the
    // island's edge or a crane's hook (`craneShare` of them), each slurm
    // crawling longer and slower, lying a while, then melting into the
    // concrete; no one comes out with a bat.
    moat: {
      slotSeconds: 20,
      jitterSeconds: 10,
      maxCount: 4,
      multiChance: 0.5,
      craneShare: 0.35,
      crawlSpeed: 0.1,
      crawlSeconds: 7,
      lingerSeconds: 18,
      // The rigs drawn at once, more than the slots overlapping hold.
      pool: 14,
    },
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
  tyler: {
    // Where Tyler Etters' red Jeep is parked on the spawn Citgo's lot,
    // station-local like the bush: past Moab on the road-side corner, clear
    // of the portal ring and the sign's pole, its open back turned toward
    // Moab and the pumps. `toward` is the way its nose points (assets.ts
    // JEEP); he sits in the back, facing out (figure.ts buildTyler).
    at: { x: 9.3, z: 12.6 },
    toward: { x: 10.4, z: 16.4 },
    // How close E must be to talk to him, from where he sits.
    reach: 2.4,
    // The Jeep blocks as a capsule down its length (this far either side
    // of its middle, this wide).
    halfLength: 1.3,
    radius: 1.0,
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
    // The lookout tower (lookout.ts), maze-local: just out from the gate,
    // on the far side of the ENTER! sign from the road, clear of the
    // donut field and the trail out. E within `climbReach` of the ladder's
    // foot climbs it, and at its top climbs back down. Trees and lamps keep
    // `clear` off its footprint.
    lookout: { at: { x: 61, z: -8 }, climbReach: 1.6, clear: 4 },
  },
  // The Caretaker: one floating shade that walks the corn maze's paths
  // (caretaker.ts, sharedworld.ts rule 13). It patrols out to a random
  // corner of the maze and back to the heart, by turns, at patrolSpeed.
  // A raider on foot in the maze it can see within sightRange, or one
  // within senseRadius whether it can see them or not, it hunts at
  // huntSpeed (faster than a walk, slower than a sprint), and gives up
  // forgetSeconds after it last saw them. Its touch at touchRadius is a
  // strike, as a shadowman's. Two raiders' beams on it at once for
  // burnSeconds burn it, and it forms again at the heart respawnSeconds
  // later; one beam alone does nothing. It floats hover metres over the
  // paths, and a beam is aimed at chestHeight over the holder's feet.
  caretaker: {
    patrolSpeed: 2.2,
    huntSpeed: 6.5,
    sightRange: 18,
    senseRadius: 3,
    forgetSeconds: 4,
    touchRadius: 1.1,
    // In reach it stops and winds up for windupSeconds, its lantern drawn
    // back, then lunges; the lunge lands within reachScale of its touch.
    windupSeconds: 0.45,
    reachScale: 1.3,
    burnSeconds: 1.2,
    respawnSeconds: 180,
    hover: 0.5,
    chestHeight: 1.6,
    // How far its body keeps off the corn when it cuts a corner, and how
    // often a hunt works out its way through the paths again, in seconds.
    clearance: 0.45,
    rethinkSeconds: 0.5,
    // Burned, it leaves this many 1 troy ounce bars of gold bullion lying
    // where it was, each a drop of its own (drops.ts spillsOf).
    bullion: 2,
  },
  // The raider's level (progression.ts): one XP bar for the account, fed
  // by everything. Reaching level L takes base * (L - 1) ^ power XP in all,
  // so each level asks a little more than the last; uncapped by the
  // season, and never past maxLevel.
  progression: {
    base: 100,
    power: 1.5,
    maxLevel: 99,
  },
  // Finding places pays (sharedworld.ts rule 28 and rule 20), once an
  // account, in cents: every Citgo the first time it stands on the
  // forecourt (but the first, the spawn Citgo), and Mt. Coleman's Keep the first time its page is written
  // in the Book of Shadows (book.ts bountyOf).
  bounties: {
    citgo: 500,
    keep: 2500,
  },
}
