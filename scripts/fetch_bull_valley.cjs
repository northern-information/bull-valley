#!/usr/bin/env node
'use strict'

// Fetches the real-world layers behind BULL VALLEY SHADOW WARS and writes
// them as committed static assets. Run by hand (npm run fetch:data) when the
// source data should be refreshed; the build never calls it. Ported from
// forgotten-industries, where the same script feeds the Scaduscope.
//
// Why a one-off script and not a build step: build-time network fetches are
// unreliable, so the terrain, roads, water, and traffic counts are fetched
// once here and shipped as files.
//
// Sources:
//   - Village boundary, public roads, water, nature reserves, graveyards, and
//     gas stations: OpenStreetMap
//     (Nominatim + Overpass), ODbL 1.0.
//   - Traffic: Illinois DOT Annual Average Daily Traffic (AADT) MapServer.
//   - Terrain: AWS Terrain Tiles (Terrarium encoding), built from USGS 3DEP.
//
// Privacy: the survey is public infrastructure only. Driveways, service roads,
// and buildings are never requested, so no output of this script can point at
// a private home. Hand-placed landmarks, including the one private home
// (Mt. Coleman's Keep, added with its owner's consent), live in
// src/landmarks.ts and are not fetched here.
//
// Outputs (public/data/bull-valley/):
//   geo.json     boundary, roads, water, reserves, and AADT segments, projected
//                into a unit square (x right, y down) and quantized to 1e-4.
//   terrain.png  a TERRAIN_SIZE² heightmap over the same square, 16 bits packed
//                as R (high byte) + G (low byte); the elevation range in metres
//                is recorded in geo.json.terrain.
//
// Usage: node scripts/fetch_bull_valley.cjs [--reuse-traffic]
//
// --reuse-traffic keeps the committed AADT segments instead of asking IDOT,
// re-projected from the bbox they were fetched with. For when IDOT is
// unreachable. Major roads in any part of the frame north of the envelope
// IDOT was last queried with (geo.json.trafficBbox) get estimated counts,
// marked `e: 1` with no year, so the page never cites them as IDOT's: the
// road's own measured median where IDOT counts it elsewhere, else the median
// for its road class. A full refresh replaces every estimate with IDOT data.
// geo.json records the traffic's own fetch date either way.
//
// Without the flag, a refresh that cannot reach IDOT at all (DNS failure,
// refused or dropped connection, timeout, HTTP 5xx or 429) warns and falls
// back to the same reuse path, so the other layers still refresh. A reply
// IDOT did send but that is wrong (an error payload, a truncated result)
// still fails the run: that is a data problem, not an outage.

const fs = require('fs')
const path = require('path')
const sharp = require('sharp')

const OUT = path.join(__dirname, '..', 'public', 'data', 'bull-valley')
const UA = 'bull-valley-shadow-wars/0.1 (+https://forgottenindustries.org)'

// A ~15x15 km frame centred where the Scaduscope's was (42.3335, -88.3660).
// Bull Valley itself has no gas stations, so the frame reaches out far enough
// to bring the perimeter stations inside the playable square: the west cluster
// (BP, Shell, Mobil, Murphy USA, Casey's at 5-6.5 km W), the east cluster
// (Marathon, Citgo, Mobil at 6.3-6.8 km E), and the north BP. Mt. Coleman's
// Keep (src/landmarks.ts) and the Cabbage Stand sit comfortably interior.
const BBOX = { south: 42.2655, west: -88.4575, north: 42.4015, east: -88.2745 }
// With the wider frame the stations are inside it; fuel searches the same box.
const FUEL_BBOX = BBOX
// 1024 keeps metres-per-pixel comparable to the old 512 over the smaller frame.
const TERRAIN_SIZE = 1024
const TERRAIN_ZOOM = 13
// How long to wait on IDOT before treating it as unreachable.
const IDOT_TIMEOUT_MS = 60_000
// How long to wait on any other request. Overpass gets [timeout:60] in the
// query itself, so this leaves it room to answer.
const REQUEST_TIMEOUT_MS = 90_000
// Tries per terrain tile when S3 is unreachable.
const TILE_TRIES = 3

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// Public road classes only. Service roads (driveways, parking aisles) and
// footways are excluded on purpose — see the privacy note above.
const ROAD_CLASSES = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'unclassified',
  'residential',
  'motorway_link',
  'trunk_link',
  'primary_link',
  'secondary_link',
  'tertiary_link',
]

// Equirectangular projection into the unit square, corrected for latitude so
// a metre is the same length on both axes. The square's aspect is recorded.
const MID_LAT = ((BBOX.north + BBOX.south) / 2) * (Math.PI / 180)
const WIDTH_M = (BBOX.east - BBOX.west) * 111320 * Math.cos(MID_LAT)
const HEIGHT_M = (BBOX.north - BBOX.south) * 110574
const q = (n) => Math.round(n * 1e4) / 1e4
const project = (lon, lat) => [
  q((lon - BBOX.west) / (BBOX.east - BBOX.west)),
  q((BBOX.north - lat) / (BBOX.north - BBOX.south)),
]

async function fetchJson(url, init = {}) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    ...init,
    headers: { 'User-Agent': UA, ...(init.headers || {}) },
  })
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText} for ${url}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

// True when a request never got a usable answer from the server: Node's fetch
// throws TypeError('fetch failed') for DNS, connection, and TLS failures;
// AbortSignal.timeout throws a TimeoutError; 5xx and 429 mean the server is
// down or shedding load. Anything else is a real reply and not an outage.
function isUnreachable(err) {
  if (!err) return false
  if (err.name === 'TimeoutError') return true
  if (err instanceof TypeError && err.message === 'fetch failed') return true
  return err.status >= 500 || err.status === 429
}

async function overpass(query) {
  const body = new URLSearchParams({ data: query })
  let lastErr
  for (const endpoint of OVERPASS) {
    try {
      return await fetchJson(endpoint, { method: 'POST', body })
    } catch (err) {
      console.warn(`[overpass] ${endpoint} failed: ${err.message}`)
      lastErr = err
    }
  }
  throw lastErr
}

async function fetchBoundary() {
  const url =
    'https://nominatim.openstreetmap.org/lookup?osm_ids=R126046&format=json&polygon_geojson=1'
  const [place] = await fetchJson(url)
  if (!place?.geojson) throw new Error('Bull Valley boundary not returned')
  const { type, coordinates } = place.geojson
  const polys = type === 'Polygon' ? [coordinates] : coordinates
  return polys.map((poly) => poly[0].map(([lon, lat]) => project(lon, lat)))
}

async function fetchOsm() {
  const bb = `${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east}`
  const fuelBb = `${FUEL_BBOX.south},${FUEL_BBOX.west},${FUEL_BBOX.north},${FUEL_BBOX.east}`
  const query = `[out:json][timeout:60];
(
  way["highway"~"^(${ROAD_CLASSES.join('|')})$"](${bb});
  way["waterway"~"^(river|stream|canal)$"](${bb});
  way["natural"="water"](${bb});
  way["natural"="wetland"](${bb});
  way["leisure"="nature_reserve"](${bb});
  way["landuse"="cemetery"](${bb});
  way["amenity"="grave_yard"](${bb});
);
out tags geom;
(
  node["landuse"="cemetery"](${bb});
  node["amenity"="grave_yard"](${bb});
  nwr["amenity"="fuel"](${fuelBb});
);
out tags center;`
  const data = await overpass(query)
  const roads = []
  const water = []
  const wetland = []
  const reserves = []
  const graveyards = []
  const fuel = []
  for (const el of data.elements) {
    const t = el.tags || {}
    // Point features: a node's own position, or a way/relation's centre.
    const point = el.center || (el.type === 'node' ? el : null)
    if (t.amenity === 'fuel' && point) {
      fuel.push({
        n: t.name || t.brand || '',
        p: project(point.lon, point.lat),
      })
      continue
    }
    const isGraveyard = t.landuse === 'cemetery' || t.amenity === 'grave_yard'
    if (isGraveyard && el.type === 'node') {
      graveyards.push({ n: t.name || '', c: project(el.lon, el.lat), p: [] })
      continue
    }
    if (el.type !== 'way' || !el.geometry) continue
    if (isGraveyard) {
      const ring = el.geometry.map((p) => project(p.lon, p.lat))
      const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length
      const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length
      graveyards.push({ n: t.name || '', c: [q(cx), q(cy)], p: ring })
      continue
    }
    const line = el.geometry.map((p) => project(p.lon, p.lat))
    if (t.highway) {
      // The query asks only for public classes, but the reply can come from
      // a third-party mirror. Never keep a driveway or service road.
      if (!ROAD_CLASSES.includes(t.highway)) continue
      roads.push({
        c: t.highway.replace('_link', ''),
        n: t.name || '',
        p: line,
      })
    } else if (t.waterway) {
      water.push({ k: 'line', n: t.name || '', p: line })
    } else if (t.natural === 'water') {
      water.push({ k: 'area', n: t.name || '', p: line })
    } else if (t.natural === 'wetland') {
      wetland.push(line)
    } else if (t.leisure === 'nature_reserve') {
      reserves.push({ n: t.name || '', p: line })
    }
  }
  return { roads, water, wetland, reserves, graveyards, fuel }
}

async function fetchTraffic() {
  const params = new URLSearchParams({
    where: '1=1',
    geometry: `${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}`,
    geometryType: 'esriGeometryEnvelope',
    inSR: '4326',
    outSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'ROAD_NAME,MARKED_NAM,AADT,AADT_YR,HCV_AADT',
    returnGeometry: 'true',
    f: 'json',
  })
  const url = `https://gis1.dot.illinois.gov/arcgis/rest/services/AdministrativeData/AADT/MapServer/0/query?${params}`
  const data = await fetchJson(url, {
    signal: AbortSignal.timeout(IDOT_TIMEOUT_MS),
  })
  if (data.error) throw new Error(`IDOT: ${JSON.stringify(data.error)}`)
  if (data.exceededTransferLimit) {
    throw new Error('IDOT result was truncated; page the query')
  }
  const segments = []
  for (const f of data.features) {
    const a = f.attributes
    if (!a.AADT) continue
    for (const pathPts of f.geometry?.paths || []) {
      segments.push({
        n: (a.ROAD_NAME || a.MARKED_NAM || '').trim(),
        v: a.AADT,
        y: a.AADT_YR,
        h: a.HCV_AADT || 0,
        p: pathPts.map(([lon, lat]) => project(lon, lat)),
      })
    }
  }
  return segments
}

// The committed AADT segments, un-projected from the bbox recorded with them
// and projected into the current one, plus estimates for major roads north of
// the envelope IDOT was queried with. See --reuse-traffic in the header.
function reuseTraffic(roads) {
  const file = path.join(OUT, 'geo.json')
  let prev
  try {
    prev = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    throw new Error(`cannot reuse traffic: ${file} is unreadable`, {
      cause: err,
    })
  }
  if (!prev?.bbox || !Array.isArray(prev.traffic)) {
    throw new Error(`cannot reuse traffic: ${file} has no bbox or traffic`)
  }
  const b = prev.bbox
  const envelope = prev.trafficBbox || prev.bbox
  const measured = prev.traffic
    .filter((s) => !s.e)
    .map((s) => ({
      ...s,
      p: s.p.map(([x, y]) =>
        project(
          b.west + x * (b.east - b.west),
          b.north - y * (b.north - b.south)
        )
      ),
    }))
  const estimated = estimateTraffic(roads, measured, envelope)
  return {
    traffic: [...measured, ...estimated],
    trafficFetched: prev.trafficFetched || prev.fetched,
    trafficBbox: envelope,
  }
}

// Road classes IDOT counts; residential streets are left without estimates.
const ESTIMATED_CLASSES = [
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
]
// IDOT abbreviates ("Thompson Rd"); OSM spells out ("Thompson Road").
const roadKey = (n) =>
  n
    .toLowerCase()
    .replace(/\broad\b/g, 'rd')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\bavenue\b/g, 'ave')
    .replace(/\bdrive\b/g, 'dr')
    .trim()
const median = (list) => {
  const s = [...list].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

function estimateTraffic(roads, measured, envelope) {
  const byName = new Map()
  for (const s of measured) {
    if (!s.n) continue
    const k = roadKey(s.n)
    byName.set(k, [...(byName.get(k) || []), s.v])
  }
  // Class medians over distinct counted roads, so a road split into many OSM
  // ways counts once.
  const classRoads = new Map()
  for (const r of roads) {
    if (!r.n || !ESTIMATED_CLASSES.includes(r.c)) continue
    const counts = byName.get(roadKey(r.n))
    if (!counts) continue
    const named = classRoads.get(r.c) || new Map()
    named.set(roadKey(r.n), median(counts))
    classRoads.set(r.c, named)
  }
  const classMedian = new Map(
    [...classRoads].map(([c, named]) => [c, median([...named.values()])])
  )

  // The uncovered strip: everything north of the envelope's north edge.
  const edgeY = project(envelope.west, envelope.north)[1]
  const out = []
  for (const r of roads) {
    if (!ESTIMATED_CLASSES.includes(r.c)) continue
    const own = r.n && byName.get(roadKey(r.n))
    const v = own ? median(own) : classMedian.get(r.c)
    if (!v) continue
    // Runs of the way inside the strip, each reaching one point past the edge
    // so it meets the measured network rather than stopping short.
    let run = []
    const flush = () => {
      if (run.length > 1) out.push({ n: r.n, v, y: null, h: 0, e: 1, p: run })
      run = []
    }
    for (let i = 0; i < r.p.length; i++) {
      if (r.p[i][1] < edgeY) {
        if (!run.length && i > 0) run.push(r.p[i - 1])
        run.push(r.p[i])
      } else if (run.length) {
        run.push(r.p[i])
        flush()
      }
    }
    flush()
  }
  console.log(
    `estimated ${out.length} segments north of y=${edgeY}; class medians ` +
      JSON.stringify(Object.fromEntries(classMedian))
  )
  return out
}

// One terrain tile as PNG bytes. Retries an unreachable S3; any other
// failure stops the run.
async function fetchTile(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      if (!res.ok) {
        const err = new Error(`${res.status} for ${url}`)
        err.status = res.status
        throw err
      }
      return Buffer.from(await res.arrayBuffer())
    } catch (err) {
      if (attempt >= TILE_TRIES || !isUnreachable(err)) throw err
      console.warn(`[terrain] ${url} failed (${err.message}); retrying`)
    }
  }
}

// Web Mercator tile maths.
const lonToTileX = (lon, z) => ((lon + 180) / 360) * 2 ** z
const latToTileY = (lat, z) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
}

async function fetchTerrain() {
  const z = TERRAIN_ZOOM
  const x0 = Math.floor(lonToTileX(BBOX.west, z))
  const x1 = Math.floor(lonToTileX(BBOX.east, z))
  const y0 = Math.floor(latToTileY(BBOX.north, z))
  const y1 = Math.floor(latToTileY(BBOX.south, z))
  const cols = x1 - x0 + 1
  const rows = y1 - y0 + 1

  // Decode each Terrarium tile to metres: (R*256 + G + B/256) - 32768.
  const mosaic = new Float32Array(cols * 256 * rows * 256)
  const mosaicW = cols * 256
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${tx}/${ty}.png`
      const png = await fetchTile(url)
      const { data, info } = await sharp(png)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      if (info.width !== 256 || info.height !== 256) {
        throw new Error(`unexpected tile size ${info.width}x${info.height}`)
      }
      for (let py = 0; py < 256; py++) {
        for (let px = 0; px < 256; px++) {
          const i = (py * 256 + px) * 3
          const m = data[i] * 256 + data[i + 1] + data[i + 2] / 256 - 32768
          const mx = (tx - x0) * 256 + px
          const my = (ty - y0) * 256 + py
          mosaic[my * mosaicW + mx] = m
        }
      }
    }
  }

  // Resample onto the unit square (bilinear), so the heightmap lines up with
  // the equirectangular vector layers rather than with Mercator tiles.
  const N = TERRAIN_SIZE
  const heights = new Float32Array(N * N)
  const sample = (fx, fy) => {
    const x = Math.min(mosaicW - 2, Math.max(0, fx))
    const y = Math.min(rows * 256 - 2, Math.max(0, fy))
    const ix = Math.floor(x)
    const iy = Math.floor(y)
    const dx = x - ix
    const dy = y - iy
    const at = (a, b) => mosaic[b * mosaicW + a]
    return (
      at(ix, iy) * (1 - dx) * (1 - dy) +
      at(ix + 1, iy) * dx * (1 - dy) +
      at(ix, iy + 1) * (1 - dx) * dy +
      at(ix + 1, iy + 1) * dx * dy
    )
  }
  let min = Infinity
  let max = -Infinity
  for (let j = 0; j < N; j++) {
    const lat = BBOX.north - ((j + 0.5) / N) * (BBOX.north - BBOX.south)
    const fy = (latToTileY(lat, z) - y0) * 256
    for (let i = 0; i < N; i++) {
      const lon = BBOX.west + ((i + 0.5) / N) * (BBOX.east - BBOX.west)
      const fx = (lonToTileX(lon, z) - x0) * 256
      const h = sample(fx, fy)
      heights[j * N + i] = h
      if (h < min) min = h
      if (h > max) max = h
    }
  }

  // 16 bits of normalized height packed into two 8-bit channels: R is the high
  // byte, G the low byte, B unused. WebGL uploads PNGs at 8 bits per channel,
  // so a 16-bit grayscale PNG would lose its precision on the way in; the
  // shader reassembles height = (R*256 + G) / 65535 instead.
  const pixels = Buffer.alloc(N * N * 3)
  for (let k = 0; k < heights.length; k++) {
    const v = Math.round(((heights[k] - min) / (max - min)) * 65535)
    pixels[k * 3] = v >> 8
    pixels[k * 3 + 1] = v & 255
  }
  const png = await sharp(pixels, { raw: { width: N, height: N, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer()

  return {
    range: {
      size: N,
      min: Math.round(min * 10) / 10,
      max: Math.round(max * 10) / 10,
    },
    png,
  }
}

// geo.json holds the range that decodes terrain.png, so the two files must
// change together. Both go to temporary files first; the renames run only
// after both writes succeed.
function writeOutputs(geo, terrainPng) {
  const files = [
    ['geo.json', JSON.stringify(geo)],
    ['terrain.png', terrainPng],
  ]
  for (const [name, data] of files) {
    fs.writeFileSync(path.join(OUT, `${name}.tmp`), data)
  }
  for (const [name] of files) {
    fs.renameSync(path.join(OUT, `${name}.tmp`), path.join(OUT, name))
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const today = new Date().toISOString().slice(0, 10)
  const reuse = process.argv.includes('--reuse-traffic')
  const boundary = await fetchBoundary()
  const osm = await fetchOsm()
  let trafficSource = reuse ? 'reused (--reuse-traffic)' : 'IDOT'
  let result
  if (reuse) {
    result = reuseTraffic(osm.roads)
  } else {
    try {
      result = {
        traffic: await fetchTraffic(),
        trafficFetched: today,
        trafficBbox: BBOX,
      }
    } catch (err) {
      if (!isUnreachable(err)) throw err
      const cause = err.cause?.code || err.cause?.message || err.message
      console.warn(
        `\n[traffic] WARNING: IDOT is unreachable (${cause}). Falling back to ` +
          'the committed counts plus estimates, as --reuse-traffic would. ' +
          'Rerun once IDOT is back to replace them.\n'
      )
      result = reuseTraffic(osm.roads)
      trafficSource = `reused (IDOT unreachable: ${cause})`
    }
  }
  const { traffic, trafficFetched, trafficBbox } = result
  const { range: terrain, png: terrainPng } = await fetchTerrain()
  const geo = {
    fetched: today,
    trafficFetched,
    trafficBbox,
    bbox: BBOX,
    metres: { width: Math.round(WIDTH_M), height: Math.round(HEIGHT_M) },
    terrain,
    boundary,
    ...osm,
    traffic,
    sources: {
      osm: 'OpenStreetMap contributors, ODbL 1.0',
      traffic: 'Illinois Department of Transportation, AADT',
      terrain: 'AWS Terrain Tiles (Terrarium), USGS 3DEP',
    },
  }
  writeOutputs(geo, terrainPng)
  console.log(
    `boundary rings ${boundary.length}, roads ${osm.roads.length}, water ${osm.water.length}, ` +
      `wetland ${osm.wetland.length}, reserves ${osm.reserves.length}, graveyards ${osm.graveyards.length}, ` +
      `fuel ${osm.fuel.length}, traffic ${traffic.length}, ` +
      `terrain ${terrain.min}–${terrain.max} m`
  )
  console.log(`traffic source: ${trafficSource}, counts from ${trafficFetched}`)
}

// fetchTerrain is exported so the terrain step can be checked alone against
// the committed terrain.png, without Overpass or IDOT.
module.exports = { isUnreachable, fetchTerrain }

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
