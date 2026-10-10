// Every placed 3D asset in Bull Valley, defined once in asset-local space.
// world.ts instances these parts across the valley; the Akashic dev page
// (/akashic) assembles one of each for inspection. A part is
// { name, geometry, material, position?, rotation?, scale? }. Instanced
// assets export parts; one-off assets export a builder that returns an
// Object3D. Building parts consumes no rng, so placement seeds stay put.
//
// This is the barrel: the builders live in the modules below, one a
// subject, and everything imports them from here. The kit they share is
// assetkit.ts; the Akashic registry, which imports every builder, is
// akashicassets.ts.

export * from './akashicassets.ts'
export * from './assetkit.ts'
export * from './berrybush.ts'
export * from './cabbagestandmodel.ts'
export * from './caretakermodel.ts'
export * from './citgo.ts'
export * from './cornmazeparts.ts'
export * from './dishes.ts'
export * from './drinkmodels.ts'
export * from './fire.ts'
export * from './medicinemodels.ts'
export * from './pickups.ts'
export * from './props.ts'
export * from './roadsideparts.ts'
export * from './shadowburstmodel.ts'
export * from './shadowspider.ts'
export * from './skeletonhorse.ts'
export * from './sky.ts'
export * from './surfaces.ts'
export * from './truckbody.ts'
export * from './wreck.ts'
