import * as THREE from 'three'
import {
  artTexture,
  makeGlowSprite,
  makeGlowTexture,
  memo,
  packFace,
  packFlat,
  setPulseMaterials,
} from './assetkit.ts'
import { cap, drinkLabel, lathe, need } from './drinkmodels.ts'
import { itemById } from './items.ts'
import { paintMedicine } from './medart.ts'
import type { PickupOptions } from './assetkit.ts'
import type { CanvasArt } from './canvas.ts'
import type { MedicineForm } from './interfaces.ts'
import type { MedicineArt } from './medart.ts'

const medicineArt = memo(paintMedicine)

// --- Medicine ------------------------------------------------------------

// The over-the-counter rack by the register, one shape per MedicineForm: a
// 24-count pill bottle, a folding carton, and a half-ounce dropper bottle,
// each with its painted label (medart.ts). Sizes in metres, origin at
// ground level under the middle, art facing +Z.
const MEDICINE_GLOW_SCALE = 0.7

interface MedicineMaterials {
  face: (canvasArt: CanvasArt | undefined) => THREE.MeshLambertMaterial
  flat: (color: string | undefined) => THREE.MeshLambertMaterial
}

type MedicinePartsBuilder = (
  art: MedicineArt,
  mats: MedicineMaterials
) => { parts: THREE.Object3D[]; height: number }

// A pill bottle: 38 mm across, a wrap label, a child-proof cap.
function pillsParts(
  art: MedicineArt,
  { face, flat }: MedicineMaterials
): ReturnType<MedicinePartsBuilder> {
  const R = 0.019
  const H = 0.062
  const body = lathe(
    [
      [0, 0.002],
      [R * 0.85, 0],
      [R, 0.004],
      [R, 0.046],
      [R * 0.9, 0.05],
      [R * 0.8, 0.051],
    ],
    flat(art.plastic)
  )
  return {
    parts: [
      body,
      drinkLabel(face(art.label), R * 1.01, 0.008, 0.042),
      cap(flat(art.cap), R * 0.98, 0.05, H),
    ],
    height: H,
  }
}

// A folding carton, standing on its base, front toward +Z. BoxGeometry
// face order: +x, -x, +y, -y, +z, -z.
function cartonParts(
  art: MedicineArt,
  { face, flat }: MedicineMaterials
): ReturnType<MedicinePartsBuilder> {
  const W = 0.07
  const H = 0.1
  const D = 0.025
  const front = face(art.front)
  const side = face(art.side)
  const edge = flat(art.edge)
  const carton = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [
    side,
    side,
    edge,
    edge,
    front,
    front,
  ])
  carton.position.y = H / 2
  return { parts: [carton], height: H }
}

// A dropper bottle: 26 mm across, a wrap label, a tall tapered cap.
function dropperParts(
  art: MedicineArt,
  { face, flat }: MedicineMaterials
): ReturnType<MedicinePartsBuilder> {
  const R = 0.013
  const H = 0.075
  const body = lathe(
    [
      [0, 0.002],
      [R * 0.8, 0],
      [R, 0.004],
      [R, 0.045],
      [R * 0.85, 0.052],
      [0.007, 0.056],
      [0.007, 0.058],
    ],
    flat(art.plastic)
  )
  const top = lathe(
    [
      [0.0085, 0.056],
      [0.0085, 0.07],
      [0.0065, H],
      [0, H],
    ],
    flat(art.cap)
  )
  return {
    parts: [body, drinkLabel(face(art.label), R * 1.01, 0.008, 0.042), top],
    height: H,
  }
}

const MEDICINE_PARTS: Record<MedicineForm, MedicinePartsBuilder> = {
  pills: pillsParts,
  carton: cartonParts,
  dropper: dropperParts,
}

// glow: false leaves out the halo, for close-up views like the inventory.
export function buildMedicine(
  medicineId: string,
  { glow = true }: PickupOptions = {}
): THREE.Group {
  const medicine = itemById(medicineId)
  if (medicine?.category !== 'medicine') {
    throw new Error(`Unknown medicine "${medicineId}"`)
  }
  const art = medicineArt(medicineId)
  const group = new THREE.Group()
  group.name = `med-${medicineId}`
  const pulse: THREE.MeshLambertMaterial[] = []
  const mats: MedicineMaterials = {
    face(canvasArt) {
      const m = packFace(artTexture(need(canvasArt, 'label canvas')))
      pulse.push(m)
      return m
    },
    flat(color) {
      const m = packFlat(need(color, 'color'))
      pulse.push(m)
      return m
    },
  }
  const { parts, height } = MEDICINE_PARTS[medicine.form](art, mats)
  group.add(...parts)
  if (glow) {
    const halo = makeGlowSprite(makeGlowTexture(art.glow), MEDICINE_GLOW_SCALE)
    halo.position.y = height * 0.5
    group.add(halo)
  }
  setPulseMaterials(group, pulse)
  return group
}
