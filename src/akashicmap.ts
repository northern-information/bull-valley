// Akashic's Map mode (/akashic#map): the survey (geo.json) from above over
// a hillshade of terrain.png, to read and edit by hand. Pan, zoom, pick a
// feature, drag its points, add and remove points and features, name them,
// undo, and save the file back through the dev server (vite.config.ts
// akashicMapSave). The edits themselves are mapedit.ts's; this is the
// canvas and the panels.

import { context2d } from './canvas.ts'
import { unitToWorld } from './coords.ts'
import { CABBAGE_PATCH, landmarkWorldPositions } from './landmarks.ts'
import {
  addFeature,
  areaSquareMetres,
  deleteFeature,
  deleteVertex,
  featureAt,
  History,
  hitTest,
  insertVertex,
  LAYERS,
  lengthMetres,
  minPoints,
  moveFeature,
  moveVertex,
  nameOf,
  newFeature,
  pointsOf,
  ROAD_CLASSES,
  serializeGeo,
  setProps,
  shapeOf,
  snapPoint,
} from './mapedit.ts'
import { loadTerrain } from './terrain.ts'
import type {
  Geo,
  Ring,
  Road,
  RoadClass,
  UnitPoint,
  Water,
} from './interfaces.ts'
import type { FeatureRef, Hit, LayerId, Patch, Shape } from './mapedit.ts'
import type { TerrainData } from './terrain.ts'

const DATA_BASE = '/data/bull-valley'
const SAVE_URL = '/__akashic/geo'

// The dev hook on window.__akashic.map.
export interface MapHook {
  readonly ready: boolean
  readonly geo: Geo | null
  readonly selected: FeatureRef | null
  readonly dirty: boolean
  readonly status: string
  select(layer: LayerId, index: number): void
  // Centre the view on a unit point at a scale (CSS px across the frame).
  view(u: number, v: number, scale: number): void
  // A unit point in client (CSS) pixels, for a spec's mouse.
  toClient(u: number, v: number): { x: number; y: number }
  undo(): void
  redo(): void
  save(): Promise<void>
}

export interface MapMode {
  show(): void
  hide(): void
  hook: MapHook
}

// Hit radius round a point or a line, in CSS pixels.
const PICK_PX = 7
const MIN_SCALE = 400
const MAX_SCALE = 4_000_000

const LAYER_COLOR: Record<LayerId, string> = {
  roads: '#d6cfb8',
  water: '#3b82f6',
  wetland: '#2dd4bf',
  reserves: '#4ade80',
  graveyards: '#a8a29e',
  fuel: '#ef3b2c',
  boundary: '#f59e0b',
}

// Road widths in metres, a guide to the eye; roadside.ts has the game's.
const ROAD_METRES: Record<RoadClass, number> = {
  primary: 12,
  secondary: 10,
  tertiary: 8,
  residential: 6,
  unclassified: 5,
}
const ROAD_MIN_PX: Record<RoadClass, number> = {
  primary: 2.5,
  secondary: 2,
  tertiary: 1.6,
  residential: 1,
  unclassified: 1,
}
const SELECT = '#22d3ee'
const HOVER = '#f0ead6'

type Drag =
  | { kind: 'pan'; x: number; y: number; cu: number; cv: number }
  | { kind: 'vertex'; ref: FeatureRef; vertex: number; key: string }
  | {
      kind: 'feature'
      ref: FeatureRef
      from: UnitPoint
      key: string
      moved: UnitPoint
    }

let dragSerial = 0

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props)
  node.append(...children)
  return node
}

// A grey hillshade of the heightmap, lit from the northwest, tinted by
// height: the ground under the map.
function hillshade(terrain: TerrainData): HTMLCanvasElement {
  const { heights, size } = terrain
  const out = document.createElement('canvas')
  out.width = size
  out.height = size
  const ctx = context2d(out)
  const img = ctx.createImageData(size, size)
  const at = (x: number, y: number) =>
    heights[
      Math.min(size - 1, Math.max(0, y)) * size +
        Math.min(size - 1, Math.max(0, x))
    ]
  // Normalized heights over ~80 m of relief across ~15 m pixels.
  const zScale = 400
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * zScale
      const dy = (at(x, y + 1) - at(x, y - 1)) * zScale
      const len = Math.hypot(dx, dy, 1)
      // Light from the northwest, up 45 degrees.
      const shade = Math.max(0, (dx * -0.5 + dy * -0.5 + 0.707) / len)
      const h = at(x, y)
      const k = (y * size + x) * 4
      const base = 18 + shade * 70
      img.data[k] = base + h * 18
      img.data[k + 1] = base + h * 26
      img.data[k + 2] = base + 4
      img.data[k + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return out
}

export function mountMap(): MapMode {
  // --- DOM ---------------------------------------------------------------
  const canvas = el('canvas', { className: 'ak-map' })
  canvas.tabIndex = 0
  canvas.setAttribute('aria-label', 'Survey map')

  const layerToggles = el('div', { className: 'ak-toggles' })
  const drawLayer = el('select', { name: 'draw-layer' })
  drawLayer.setAttribute('aria-label', 'Layer to draw on')
  for (const l of LAYERS) drawLayer.add(new Option(l.label, l.id))
  drawLayer.value = 'roads'
  const drawShape = el('select', { name: 'draw-shape' })
  drawShape.setAttribute('aria-label', 'Water shape')
  drawShape.add(new Option('area', 'area'))
  drawShape.add(new Option('line', 'line'))
  const drawBtn = el('button', { type: 'button', textContent: 'Draw [N]' })
  const undoBtn = el('button', { type: 'button', textContent: 'Undo' })
  const redoBtn = el('button', { type: 'button', textContent: 'Redo' })
  const saveBtn = el('button', { type: 'button', textContent: 'Save' })
  saveBtn.className = 'ak-save'
  const fitBtn = el('button', { type: 'button', textContent: 'Fit [0]' })
  const statusEl = el('p', { className: 'ak-status' })
  statusEl.setAttribute('aria-live', 'polite')
  const cursorEl = el('p', { className: 'ak-facts' })

  const panel = el(
    'section',
    { className: 'ak-panel ak-map-panel' },
    el('h1', { textContent: 'Akashic · Map' }),
    layerToggles,
    el('div', { className: 'ak-row' }, drawLayer, drawShape, drawBtn),
    el('div', { className: 'ak-row' }, undoBtn, redoBtn, fitBtn, saveBtn),
    statusEl,
    cursorEl
  )
  panel.setAttribute('aria-label', 'Map editor')

  const inspector = el('section', { className: 'ak-panel ak-inspector' })
  inspector.setAttribute('aria-label', 'Selected feature')

  const hint = el('p', {
    className: 'ak-hint ak-map-hint',
    textContent:
      'drag pan · scroll zoom · click select · drag a point to move it · ' +
      'drag a selected feature to move it all · double-click an edge to add ' +
      'a point · Del removes the point (Shift-Del the feature) · arrows ' +
      'nudge · N draw (Enter ends, Esc cancels) · ⌘Z/⌘⇧Z · ⌘S save',
  })
  const root = el(
    'div',
    { className: 'ak-map-root' },
    canvas,
    panel,
    inspector,
    hint
  )
  root.hidden = true
  document.body.append(root)

  // --- State -------------------------------------------------------------
  let geo: Geo | null = null
  let history: History | null = null
  let shade: HTMLCanvasElement | null = null
  let terrain: TerrainData | null = null
  let loading: Promise<void> | null = null
  let shown = false

  const visible = new Set<LayerId>(LAYERS.map((l) => l.id))
  let selected: FeatureRef | null = null
  let selectedVertex: number | null = null
  let hover: Hit | null = null
  let drag: Drag | null = null
  let drawing: { layer: LayerId; shape: Shape; points: Ring } | null = null
  let cursor: UnitPoint | null = null
  let status = 'loading the survey…'

  // The view: the unit point at the canvas centre, CSS px per unit.
  let cu = 0.5
  let cv = 0.5
  let scale = 800
  let width = 1
  let height = 1

  for (const l of LAYERS) {
    const input = el('input', {
      type: 'checkbox',
      name: `layer-${l.id}`,
      checked: true,
    })
    input.addEventListener('change', () => {
      if (input.checked) visible.add(l.id)
      else visible.delete(l.id)
      redraw()
    })
    const swatch = el('span', { className: 'ak-swatch' })
    swatch.style.background = LAYER_COLOR[l.id]
    layerToggles.append(el('label', {}, input, ' ', swatch, ` ${l.label}`))
  }

  // --- View --------------------------------------------------------------
  const toScreen = (u: number, v: number): [number, number] => [
    (u - cu) * scale + width / 2,
    (v - cv) * scale + height / 2,
  ]
  const toUnit = (x: number, y: number): UnitPoint => [
    (x - width / 2) / scale + cu,
    (y - height / 2) / scale + cv,
  ]

  function fit(): void {
    cu = 0.5
    cv = 0.5
    scale = Math.min(width, height) * 0.95
    redraw()
  }

  function resize(): void {
    const dpr = window.devicePixelRatio || 1
    width = Math.max(1, window.innerWidth)
    height = Math.max(1, window.innerHeight)
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    redraw()
  }
  window.addEventListener('resize', () => {
    if (shown) resize()
  })

  // --- Drawing -----------------------------------------------------------
  let frame = 0
  function redraw(): void {
    if (frame || !shown) return
    frame = requestAnimationFrame(() => {
      frame = 0
      draw()
    })
  }

  function tracePath(
    ctx: CanvasRenderingContext2D,
    ring: Ring,
    closed: boolean
  ): void {
    ctx.beginPath()
    ring.forEach(([u, v], i) => {
      const [x, y] = toScreen(u, v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    if (closed) ctx.closePath()
  }

  function draw(): void {
    const dpr = window.devicePixelRatio || 1
    const ctx = context2d(canvas)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = '#05070b'
    ctx.fillRect(0, 0, width, height)
    if (!geo) return

    // The frame and the ground in it.
    const [x0, y0] = toScreen(0, 0)
    if (shade) {
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(shade, x0, y0, scale, scale)
    }
    ctx.strokeStyle = '#334155'
    ctx.lineWidth = 1
    ctx.strokeRect(x0, y0, scale, scale)

    const pxPerMetre = scale / geo.metres.width
    // Bottom of LAYERS first, so the top of the list draws over the rest.
    for (const spec of [...LAYERS].reverse()) {
      if (!visible.has(spec.id)) continue
      const list = geo[spec.id]
      const color = LAYER_COLOR[spec.id]
      for (let i = 0; i < list.length; i++) {
        const f = list[i]
        const ring = pointsOf(spec.id, f)
        const shape = shapeOf(spec.id, f)
        if (shape === 'point') {
          const [x, y] = toScreen(ring[0][0], ring[0][1])
          ctx.fillStyle = color
          ctx.fillRect(x - 4, y - 4, 8, 8)
          ctx.strokeStyle = '#000'
          ctx.strokeRect(x - 4, y - 4, 8, 8)
          continue
        }
        tracePath(ctx, ring, shape === 'area')
        if (shape === 'area' && spec.id !== 'boundary') {
          ctx.globalAlpha = spec.id === 'water' ? 0.55 : 0.22
          ctx.fillStyle = color
          ctx.fill()
          ctx.globalAlpha = 1
        }
        ctx.strokeStyle = color
        if (spec.id === 'roads') {
          const c = (f as Road).c
          ctx.lineWidth = Math.max(ROAD_MIN_PX[c], ROAD_METRES[c] * pxPerMetre)
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
        } else {
          ctx.lineWidth = spec.id === 'boundary' ? 1.5 : 1
        }
        ctx.setLineDash(spec.id === 'boundary' ? [6, 4] : [])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Landmarks: read only, src/landmarks.ts.
    const marks = landmarkWorldPositions(geo.bbox, geo.metres, [
      CABBAGE_PATCH,
    ]).concat(landmarkWorldPositions(geo.bbox, geo.metres))
    ctx.font = '11px "IBM Plex Mono", monospace'
    for (const m of marks) {
      const [x, y] = toScreen(m.u, m.v)
      ctx.strokeStyle = '#e879f9'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.arc(x, y, 5, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#e879f9'
      ctx.fillText(m.n, x + 8, y + 4)
    }

    if (hover && !drag && !drawing) outline(ctx, hover.ref, HOVER, false)
    if (selected) outline(ctx, selected, SELECT, true)

    if (drawing && drawing.points.length) {
      const pts = cursor ? [...drawing.points, cursor] : drawing.points
      tracePath(ctx, pts, drawing.shape === 'area' && pts.length > 2)
      ctx.strokeStyle = SELECT
      ctx.lineWidth = 1.5
      ctx.setLineDash([4, 3])
      ctx.stroke()
      ctx.setLineDash([])
      for (const [u, v] of drawing.points) handle(ctx, u, v, false)
    }

    // Names along the hovered or selected feature.
    for (const ref of [hover?.ref, selected]) {
      if (!ref) continue
      const f = featureAt(geo, ref)
      const name = f ? nameOf(ref.layer, f) : ''
      if (!f || !name) continue
      const [u, v] = pointsOf(ref.layer, f)[0]
      const [x, y] = toScreen(u, v)
      ctx.fillStyle = '#000'
      ctx.fillText(name, x + 9, y - 7)
      ctx.fillStyle = HOVER
      ctx.fillText(name, x + 8, y - 8)
    }
  }

  function handle(
    ctx: CanvasRenderingContext2D,
    u: number,
    v: number,
    on: boolean
  ): void {
    const [x, y] = toScreen(u, v)
    ctx.fillStyle = on ? SELECT : '#020617'
    ctx.strokeStyle = SELECT
    ctx.lineWidth = 1.5
    ctx.fillRect(x - 3.5, y - 3.5, 7, 7)
    ctx.strokeRect(x - 3.5, y - 3.5, 7, 7)
  }

  function outline(
    ctx: CanvasRenderingContext2D,
    ref: FeatureRef,
    color: string,
    handles: boolean
  ): void {
    if (!geo) return
    const f = featureAt(geo, ref)
    if (!f) return
    const ring = pointsOf(ref.layer, f)
    const shape = shapeOf(ref.layer, f)
    if (shape === 'point') {
      const [x, y] = toScreen(ring[0][0], ring[0][1])
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.strokeRect(x - 7, y - 7, 14, 14)
      return
    }
    tracePath(ctx, ring, shape === 'area')
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
    if (!handles) return
    ring.forEach(([u, v], i) => handle(ctx, u, v, i === selectedVertex))
  }

  // --- Panels ------------------------------------------------------------
  function setStatus(text: string): void {
    status = text
    statusEl.textContent = text
  }

  function refreshButtons(): void {
    undoBtn.disabled = !history?.canUndo
    redoBtn.disabled = !history?.canRedo
    saveBtn.textContent = history?.dirty ? 'Save •' : 'Save'
    drawBtn.textContent = drawing ? 'Drawing… [Esc]' : 'Draw [N]'
    drawShape.hidden = drawLayer.value !== 'water'
  }

  function showCursor(): void {
    if (!geo || !cursor) {
      cursorEl.textContent = ''
      return
    }
    const [u, v] = cursor
    const { x, z } = unitToWorld(u, v, geo.metres)
    let line = `u ${u.toFixed(4)}  v ${v.toFixed(4)}\nx ${x.toFixed(0)} m  z ${z.toFixed(0)} m`
    if (terrain && u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      const i = Math.round(v * (terrain.size - 1)) * terrain.size
      const h = terrain.heights[i + Math.round(u * (terrain.size - 1))]
      const elev = geo.terrain.min + h * (geo.terrain.max - geo.terrain.min)
      line += `\nelevation ${elev.toFixed(1)} m`
    }
    cursorEl.textContent = line
  }

  function inspect(): void {
    inspector.replaceChildren()
    inspector.hidden = !selected
    const survey = geo
    if (!survey || !selected) return
    const ref = selected
    const f = featureAt(survey, ref)
    if (!f) {
      inspector.hidden = true
      return
    }
    const spec = LAYERS.find((l) => l.id === ref.layer)
    const ring = pointsOf(ref.layer, f)
    const shape = shapeOf(ref.layer, f)
    inspector.append(
      el('h1', { textContent: `${spec?.label ?? ref.layer} #${ref.index}` })
    )

    if (!Array.isArray(f)) {
      const name = el('input', {
        type: 'text',
        name: 'feature-name',
        value: nameOf(ref.layer, f),
      })
      name.setAttribute('aria-label', 'Name')
      name.addEventListener('change', () =>
        commit(setProps(survey, ref, { n: name.value }))
      )
      inspector.append(el('label', { className: 'ak-field' }, 'name ', name))
    }
    if (ref.layer === 'roads') {
      const cls = el('select', { name: 'road-class' })
      cls.setAttribute('aria-label', 'Road class')
      for (const c of ROAD_CLASSES) cls.add(new Option(c, c))
      cls.value = (f as Road).c
      cls.addEventListener('change', () =>
        commit(setProps(survey, ref, { c: cls.value as RoadClass }))
      )
      inspector.append(el('label', { className: 'ak-field' }, 'class ', cls))
    }
    if (ref.layer === 'water') {
      const kind = el('select', { name: 'water-kind' })
      kind.setAttribute('aria-label', 'Water kind')
      kind.add(new Option('area', 'area'))
      kind.add(new Option('line', 'line'))
      kind.value = (f as Water).k
      kind.addEventListener('change', () => {
        if (!commit(setProps(survey, ref, { k: kind.value as Water['k'] }))) {
          setStatus('an area needs three points')
          inspect()
        }
      })
      inspector.append(el('label', { className: 'ak-field' }, 'kind ', kind))
    }

    const facts: string[] = [
      `${ring.length} point${ring.length === 1 ? '' : 's'}`,
    ]
    if (shape === 'line')
      facts.push(
        `${lengthMetres(ring, shape, survey.metres).toFixed(0)} m long`
      )
    if (shape === 'area') {
      facts.push(
        `${(areaSquareMetres(ring, survey.metres) / 1e4).toFixed(2)} ha`
      )
      facts.push(
        `${lengthMetres(ring, shape, survey.metres).toFixed(0)} m round`
      )
    }
    const pointIndex = shape === 'point' ? 0 : selectedVertex
    if (pointIndex !== null && ring[pointIndex]) {
      const [u, v] = ring[pointIndex]
      const { x, z } = unitToWorld(u, v, survey.metres)
      if (shape !== 'point') facts.push(`point ${pointIndex}`)
      facts.push(
        `u ${u.toFixed(4)} v ${v.toFixed(4)}`,
        `x ${x.toFixed(0)} m z ${z.toFixed(0)} m`
      )
    }
    inspector.append(
      el('p', { className: 'ak-facts', textContent: facts.join('\n') })
    )

    const zoom = el('button', { type: 'button', textContent: 'Zoom to' })
    zoom.addEventListener('click', () => zoomTo(ref))
    const del = el('button', { type: 'button', textContent: 'Delete feature' })
    del.addEventListener('click', () => removeFeature(ref))
    inspector.append(el('div', { className: 'ak-row' }, zoom, del))
  }

  function zoomTo(ref: FeatureRef): void {
    if (!geo) return
    const f = featureAt(geo, ref)
    if (!f) return
    const ring = pointsOf(ref.layer, f)
    let minU = Infinity,
      minV = Infinity,
      maxU = -Infinity,
      maxV = -Infinity
    for (const [u, v] of ring) {
      minU = Math.min(minU, u)
      minV = Math.min(minV, v)
      maxU = Math.max(maxU, u)
      maxV = Math.max(maxV, v)
    }
    cu = (minU + maxU) / 2
    cv = (minV + maxV) / 2
    const span = Math.max(maxU - minU, maxV - minV, 0.004)
    scale = clampScale((Math.min(width, height) * 0.7) / span)
    redraw()
  }

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

  // --- Edits -------------------------------------------------------------
  function commit(patch: Patch | null, key: string | null = null): boolean {
    if (!history || !history.commit(patch, key)) return false
    if (patch && patch.after === null && selected?.layer === patch.layer) {
      if (selected.index === patch.index) select(null)
      else if (selected.index > patch.index)
        selected = { ...selected, index: selected.index - 1 }
    }
    if (!key) setStatus(history.dirty ? 'unsaved changes' : 'saved')
    afterChange()
    return true
  }

  function afterChange(): void {
    hover = null
    refreshButtons()
    if (!drag) inspect()
    redraw()
  }

  function select(ref: FeatureRef | null, vertex: number | null = null): void {
    selected = ref
    selectedVertex = vertex
    inspect()
    redraw()
  }

  function removeFeature(ref: FeatureRef): void {
    if (!geo) return
    if (commit(deleteFeature(geo, ref))) select(null)
  }

  // Undo and redo can add or remove a slot; keep the selection when its
  // feature is still there.
  function stepHistory(patch: Patch | null): void {
    if (!patch || !geo) return
    if (selected && !featureAt(geo, selected)) select(null)
    else selectedVertex = null
    setStatus(history?.dirty ? 'unsaved changes' : 'saved')
    afterChange()
  }

  function undo(): void {
    if (!drawing) stepHistory(history?.undo() ?? null)
  }
  function redo(): void {
    if (!drawing) stepHistory(history?.redo() ?? null)
  }

  async function save(): Promise<void> {
    if (!geo || !history) return
    setStatus('saving…')
    try {
      const res = await fetch(SAVE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: serializeGeo(geo),
      })
      const text = await res.text()
      if (!res.ok) {
        setStatus(`not saved: ${text}`)
        return
      }
      history.markSaved()
      setStatus(
        'saved to geo.json. If this moves where things are placed, bump ' +
          'PROTOCOL_VERSION in src/protocol.ts.'
      )
    } catch (err) {
      setStatus(`not saved: ${String(err)}`)
    }
    refreshButtons()
  }

  // --- Drawing new features ----------------------------------------------
  function startDrawing(): void {
    if (!geo) return
    const layer = drawLayer.value as LayerId
    const spec = LAYERS.find((l) => l.id === layer)
    const shape: Shape =
      layer === 'water' ? (drawShape.value as Shape) : (spec?.shape ?? 'area')
    drawing = { layer, shape, points: [] }
    select(null)
    setStatus(
      shape === 'point'
        ? `click to place a ${spec?.label ?? layer} point`
        : `click points of the new ${spec?.label ?? layer} ${shape}; Enter ends it`
    )
    refreshButtons()
    canvas.focus()
  }

  function finishDrawing(): void {
    if (!drawing || !geo) return
    const { layer, shape, points } = drawing
    drawing = null
    if (points.length < minPoints(shape)) {
      setStatus(`cancelled: a ${shape} needs ${minPoints(shape)} points`)
      refreshButtons()
      redraw()
      return
    }
    const patch = addFeature(geo, layer, newFeature(layer, points, shape))
    commit(patch)
    select({ layer, index: patch.index })
  }

  function cancelDrawing(): void {
    drawing = null
    setStatus(history?.dirty ? 'unsaved changes' : 'drawing cancelled')
    refreshButtons()
    redraw()
  }

  // --- Pointer -----------------------------------------------------------
  const tolerance = () => PICK_PX / scale
  const layersOn = () => [...visible]

  function pointerAt(e: MouseEvent): UnitPoint {
    const r = canvas.getBoundingClientRect()
    return toUnit(e.clientX - r.left, e.clientY - r.top)
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  canvas.addEventListener('pointerdown', (e) => {
    if (!geo) return
    canvas.focus()
    canvas.setPointerCapture(e.pointerId)
    const p = pointerAt(e)
    const pan = (): Drag => ({
      kind: 'pan',
      x: e.clientX,
      y: e.clientY,
      cu,
      cv,
    })
    if (e.button !== 0) {
      drag = pan()
      return
    }
    if (drawing) {
      drawing.points.push(snapPoint(p[0], p[1]))
      if (drawing.shape === 'point') finishDrawing()
      redraw()
      return
    }
    const hit = hitTest(geo, layersOn(), p, tolerance(), selected)
    if (!hit) {
      select(null)
      drag = pan()
      return
    }
    const wasSelected =
      selected?.layer === hit.ref.layer && selected.index === hit.ref.index
    const f = featureAt(geo, hit.ref)
    const isPoint = f !== undefined && shapeOf(hit.ref.layer, f) === 'point'
    if (hit.vertex !== undefined && !isPoint) {
      select(hit.ref, hit.vertex)
      drag = {
        kind: 'vertex',
        ref: hit.ref,
        vertex: hit.vertex,
        key: `drag${++dragSerial}`,
      }
    } else {
      select(hit.ref)
      // A fuel point moves at once; anything else only once it is selected.
      if (wasSelected || isPoint) {
        drag = {
          kind: 'feature',
          ref: hit.ref,
          from: p,
          key: `drag${++dragSerial}`,
          moved: [0, 0],
        }
      } else {
        drag = pan()
      }
    }
  })

  canvas.addEventListener('pointermove', (e) => {
    if (!geo) return
    const p = pointerAt(e)
    cursor = p
    showCursor()
    if (drag?.kind === 'pan') {
      cu = drag.cu - (e.clientX - drag.x) / scale
      cv = drag.cv - (e.clientY - drag.y) / scale
      redraw()
      return
    }
    if (drag?.kind === 'vertex') {
      commit(moveVertex(geo, drag.ref, drag.vertex, p), drag.key)
      return
    }
    if (drag?.kind === 'feature') {
      // Whole steps of the survey's grid from where the drag began, so the
      // feature never drifts by rounding.
      const du = Math.round((p[0] - drag.from[0]) * 1e4) / 1e4
      const dv = Math.round((p[1] - drag.from[1]) * 1e4) / 1e4
      const step: UnitPoint = [du - drag.moved[0], dv - drag.moved[1]]
      if (step[0] || step[1]) {
        drag.moved = [du, dv]
        commit(moveFeature(geo, drag.ref, step[0], step[1]), drag.key)
      }
      return
    }
    if (drawing) {
      redraw()
      return
    }
    const next = hitTest(geo, layersOn(), p, tolerance(), selected)
    const same =
      next?.ref.layer === hover?.ref.layer &&
      next?.ref.index === hover?.ref.index
    hover = next
    canvas.style.cursor = next ? 'pointer' : 'grab'
    if (!same) redraw()
  })

  const endDrag = () => {
    if (drag && drag.kind !== 'pan') {
      history?.seal()
      setStatus(history?.dirty ? 'unsaved changes' : 'saved')
      inspect()
    }
    drag = null
  }
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('pointerleave', () => {
    cursor = null
    showCursor()
  })

  canvas.addEventListener('dblclick', (e) => {
    if (!geo) return
    if (drawing) {
      // The double-click's two clicks both added a point; drop the second.
      drawing.points.pop()
      finishDrawing()
      return
    }
    const p = pointerAt(e)
    const hit = hitTest(geo, layersOn(), p, tolerance(), selected)
    if (hit?.segment === undefined || !hit.at) return
    const at = hit.segment + 1
    if (commit(insertVertex(geo, hit.ref, at, hit.at))) select(hit.ref, at)
  })

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      const x = e.clientX - r.left
      const y = e.clientY - r.top
      const before = toUnit(x, y)
      scale = clampScale(scale * Math.exp(-e.deltaY * 0.0015))
      // Keep the point under the cursor where it was.
      cu += before[0] - toUnit(x, y)[0]
      cv += before[1] - toUnit(x, y)[1]
      redraw()
    },
    { passive: false }
  )

  // --- Keys --------------------------------------------------------------
  function nudge(du: number, dv: number): void {
    if (!geo || !selected) return
    const f = featureAt(geo, selected)
    if (!f) return
    if (selectedVertex !== null && shapeOf(selected.layer, f) !== 'point') {
      const [u, v] = pointsOf(selected.layer, f)[selectedVertex]
      commit(
        moveVertex(geo, selected, selectedVertex, [u + du, v + dv]),
        'nudge'
      )
    } else {
      commit(moveFeature(geo, selected, du, dv), 'nudge')
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (!shown || !geo) return
    const t = e.target
    if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement) {
      if (e.key === 'Escape') t.blur()
      return
    }
    const mod = e.metaKey || e.ctrlKey
    if (mod && e.code === 'KeyZ') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
      return
    }
    if (mod && e.code === 'KeyY') {
      e.preventDefault()
      redo()
      return
    }
    if (mod && e.code === 'KeyS') {
      e.preventDefault()
      void save()
      return
    }
    if (mod) return
    if (drawing) {
      if (e.code === 'Enter') finishDrawing()
      else if (e.code === 'Escape') cancelDrawing()
      else if (e.code === 'Backspace') {
        drawing.points.pop()
        redraw()
      }
      return
    }
    const step = e.shiftKey ? 1e-3 : 1e-4
    switch (e.code) {
      case 'KeyN':
        startDrawing()
        break
      case 'Digit0':
        fit()
        break
      case 'Escape':
        select(null)
        break
      case 'Delete':
      case 'Backspace':
        if (!selected) break
        e.preventDefault()
        if (e.shiftKey || selectedVertex === null) {
          removeFeature(selected)
        } else if (commit(deleteVertex(geo, selected, selectedVertex))) {
          selectedVertex = null
          inspect()
        } else {
          setStatus(
            'that is the fewest points it can have; Shift-Del removes the feature'
          )
        }
        break
      case 'ArrowLeft':
        nudge(-step, 0)
        break
      case 'ArrowRight':
        nudge(step, 0)
        break
      case 'ArrowUp':
        nudge(0, -step)
        break
      case 'ArrowDown':
        nudge(0, step)
        break
      default:
        return
    }
    if (e.code.startsWith('Arrow')) {
      e.preventDefault()
      history?.seal()
    }
  }
  document.addEventListener('keydown', onKey)

  drawBtn.addEventListener('click', () =>
    drawing ? cancelDrawing() : startDrawing()
  )
  drawLayer.addEventListener('change', refreshButtons)
  undoBtn.addEventListener('click', undo)
  redoBtn.addEventListener('click', redo)
  fitBtn.addEventListener('click', fit)
  saveBtn.addEventListener('click', () => void save())
  window.addEventListener('beforeunload', (e) => {
    if (history?.dirty) e.preventDefault()
  })

  // --- Loading -----------------------------------------------------------
  async function load(): Promise<void> {
    try {
      const [survey, heights] = await Promise.all([
        // Never the browser's cached copy: a save rewrote it.
        fetch(`${DATA_BASE}/geo.json`, { cache: 'no-store' }).then((r) => {
          if (!r.ok) throw new Error(`geo.json ${r.status}`)
          return r.json() as Promise<Geo>
        }),
        loadTerrain(`${DATA_BASE}/terrain.png`),
      ])
      geo = survey
      terrain = heights
      shade = hillshade(heights)
      history = new History(survey)
      setStatus(
        `${survey.roads.length} roads · ${survey.water.length} water · ` +
          `${survey.fuel.length} fuel stations`
      )
    } catch (err) {
      setStatus(`the survey failed to load: ${String(err)}`)
    }
    refreshButtons()
    inspect()
    fit()
  }

  setStatus(status)
  refreshButtons()
  inspector.hidden = true

  return {
    show() {
      shown = true
      root.hidden = false
      resize()
      loading ??= load()
      canvas.focus()
    },
    hide() {
      shown = false
      root.hidden = true
    },
    hook: {
      get ready() {
        return geo !== null
      },
      get geo() {
        return geo
      },
      get selected() {
        return selected
      },
      get dirty() {
        return history?.dirty ?? false
      },
      get status() {
        return status
      },
      select: (layer, index) => select({ layer, index }),
      view(u, v, s) {
        cu = u
        cv = v
        scale = clampScale(s)
        redraw()
      },
      toClient(u, v) {
        const r = canvas.getBoundingClientRect()
        const [x, y] = toScreen(u, v)
        return { x: r.left + x, y: r.top + y }
      },
      undo,
      redo,
      save,
    },
  }
}
