#!/usr/bin/env node
'use strict'

// Fetches the real-world layers behind BULL VALLEY SHADOW WARS and writes
// them as committed static assets. Run by hand (npm run fetch:data) when the
// source data should be refreshed; the build never calls it. Ported from
// forgotten-industries, where the same script feeds the Scaduscope.
//
// Why a one-off script and not a build step: build-time network fetches are
// unreliable, so the terrain, roads, and water are fetched once here and shipped as files.
//
// Sources:
//   - Village boundary, public roads, water, nature reserves, graveyards, and
//     gas stations: OpenStreetMap
//     (Nominatim + Overpass), ODbL 1.0.
//   - Terrain: AWS Terrain Tiles (Terrarium encoding), built from USGS 3DEP.
//
// Privacy: the survey is public infrastructure only. Driveways, service roads,
// and buildings are never requested, so no output of this script can point at
// a private home. Hand-placed landmarks, including the one private home
// (Mt. Coleman's Keep, added with its owner's consent), live in
// src/landmarks.ts and are not fetched here.
//
// Outputs (public/data/bull-valley/):
//   geo.json     boundary, roads, water, reserves, and fuel, projected
//                into a unit square (x right, y down) and quantized to 1e-4.
//   terrain.png  a TERRAIN_SIZE² heightmap over the same square, 16 bits packed
//                as R (high byte) + G (low byte); the elevation range in metres
//                is recorded in geo.json.terrain.
//
// Usage: node scripts/fetch_bull_valley.cjs

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
  // client (terrain.ts) reassembles height = (R*256 + G) / 65535 instead.
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
  const boundary = await fetchBoundary()
  const osm = await fetchOsm()
  const { range: terrain, png: terrainPng } = await fetchTerrain()
  const geo = {
    fetched: today,
    bbox: BBOX,
    metres: { width: Math.round(WIDTH_M), height: Math.round(HEIGHT_M) },
    terrain,
    boundary,
    ...osm,
    sources: {
      osm: 'OpenStreetMap contributors, ODbL 1.0',
      terrain: 'AWS Terrain Tiles (Terrarium), USGS 3DEP',
    },
  }
  writeOutputs(geo, terrainPng)
  console.log(
    `boundary rings ${boundary.length}, roads ${osm.roads.length}, water ${osm.water.length}, ` +
      `wetland ${osm.wetland.length}, reserves ${osm.reserves.length}, graveyards ${osm.graveyards.length}, ` +
      `fuel ${osm.fuel.length}, ` +
      `terrain ${terrain.min}–${terrain.max} m`
  )
}

// fetchTerrain is exported so the terrain step can be checked alone against
// the committed terrain.png, without Overpass.
module.exports = { isUnreachable, fetchTerrain }

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
