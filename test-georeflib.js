/**
 * End-to-end test across every transform family, driven by a control-point
 * data file in the Manpo map/correspondence JSON format.
 *
 * Runs against `test-data-sample.json` by default. To exercise a real dataset:
 *
 *     node test-georeflib.js ./my_control_points.json
 *
 * This file previously depended on `./models/Map.js`, `./models/Point.js` and
 * `./models/Correspondence.js`, none of which are part of this repository, so
 * it could never run from a clean checkout. The model classes only reshaped the
 * JSON into two parallel coordinate arrays, which is done inline below.
 */

import fs from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PointGeoreferencer, Crs } from './index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataPath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(__dirname, 'test-data-sample.json')

let passed = 0
let failed = 0

function assert (description, condition, info = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${description}${info ? `  — ${info}` : ''}`)
    failed++
  }
}

function group (label, fn) {
  try {
    fn()
  } catch (err) {
    console.error(`  ❌ FAIL: ${label} — threw ${err?.name ?? 'Error'}: ${err?.message ?? err}`)
    failed++
  }
}

const section = title => {
  console.log('\n══════════════════════════════════════════════════')
  console.log(` Tests: ${title}`)
  console.log('══════════════════════════════════════════════════')
}

// ─────────────────────────────────────────────────────────────────────────────
// Load and reshape the control points
// ─────────────────────────────────────────────────────────────────────────────

if (!fs.existsSync(dataPath)) {
  console.error(`\n❌ Control point data not found: ${dataPath}`)
  console.error('   Pass a path explicitly:  node test-georeflib.js <data.json>\n')
  process.exit(1)
}

const coordinateObjectToArray = (coordinates, type) =>
  type === 'latlng' ? [coordinates.lng, coordinates.lat] : [coordinates.x, coordinates.y]

const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
const [map1, map2] = data.maps

/** Index every map's points by id so correspondences can be resolved cheaply. */
const pointsById = new Map(
  data.maps.map(m => [m.name, new Map(m.points.map(p => [p.id, p]))])
)

const ctrlPts1 = []
const ctrlPts2 = []
for (const correspondence of data.correspondences) {
  const ref1 = correspondence.points.find(p => p.mapName === map1.name)
  const ref2 = correspondence.points.find(p => p.mapName === map2.name)
  if (!ref1 || !ref2) continue
  const p1 = pointsById.get(map1.name)?.get(ref1.id)
  const p2 = pointsById.get(map2.name)?.get(ref2.id)
  if (!p1 || !p2) continue
  ctrlPts1.push(coordinateObjectToArray(p1.coordinates, p1.type))
  ctrlPts2.push(coordinateObjectToArray(p2.coordinates, p2.type))
}

const n = ctrlPts1.length
console.log(`\nData:   ${dataPath}`)
console.log(`Maps:   "${map1.name}" (${map1.coordinateSystem}) → "${map2.name}" (${map2.coordinateSystem})`)
console.log(`Points: ${n} matched control points`)

if (n === 0) {
  console.error('\n❌ No matching control points found between the two maps.\n')
  process.exit(1)
}

const crs1 = map1.coordinateSystem === 'xy' ? Crs.Simple : Crs.Geographic
const crs2 = map2.coordinateSystem === 'xy' ? Crs.Simple : Crs.Geographic
const georef = new PointGeoreferencer(ctrlPts1, ctrlPts2, crs1, crs2)

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const finite = p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
/** Residual of `fn` measured at the control points themselves. */
const residuals = fn => ctrlPts1.map((p, i) => dist(fn(p), ctrlPts2[i]))
const rms = arr => Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length)

// ─────────────────────────────────────────────────────────────────────────────
// 1. Interpolating transforms must reproduce the control points exactly
// ─────────────────────────────────────────────────────────────────────────────

section('exactness at the control points')

// --- Test 1a: TPS is an interpolant — zero residual at every control point ---
group('1a', () => {
  const r = residuals(p => georef.georefTPS(p))
  assert('1a: TPS reproduces every control point', Math.max(...r) < 1e-6,
    `max residual = ${Math.max(...r).toExponential(3)}`)
})

// --- Test 1b: the TIN affine is exact at its own vertices ---
group('1b', () => {
  const r = residuals(p => georef.georefAffineWithTIN(p, {}, false))
  assert('1b: TIN reproduces every control point', Math.max(...r) < 1e-6,
    `max residual = ${Math.max(...r).toExponential(3)}`)
})

// --- Test 1c: the fallback variant is exact too ---
group('1c', () => {
  const r = residuals(p => georef.georefAffineWithTINFallbackTPS(p, {}))
  assert('1c: TIN-with-TPS-fallback reproduces every control point', Math.max(...r) < 1e-6,
    `max residual = ${Math.max(...r).toExponential(3)}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Polynomial regression
// ─────────────────────────────────────────────────────────────────────────────

section('polynomial regression (orders 1–3)')

const requiredPoints = { 1: 3, 2: 6, 3: 10 }
const polyRms = {}

for (const order of [1, 2, 3]) {
  group(`2-order${order}`, () => {
    if (n < requiredPoints[order]) {
      console.log(`  ⏭  SKIP: order ${order} needs ${requiredPoints[order]} control points, have ${n}`)
      return
    }
    const r = residuals(p => georef.georefPolynomial(p, order))
    polyRms[order] = rms(r)
    assert(`2a: order ${order} — every control point maps to a finite coordinate`,
      ctrlPts1.every(p => finite(georef.georefPolynomial(p, order))))
    assert(`2b: order ${order} — RMS residual is bounded (${polyRms[order].toFixed(3)})`,
      polyRms[order] < 1e4, `RMS = ${polyRms[order]}`)
  })
}

// --- Test 2c: more degrees of freedom must not fit the control points worse ---
group('2c', () => {
  if (polyRms[1] === undefined || polyRms[2] === undefined) {
    console.log('  ⏭  SKIP: needs at least 6 control points')
    return
  }
  assert('2c: order 2 fits the control points at least as well as order 1',
    polyRms[2] <= polyRms[1] + 1e-9,
    `order1 RMS = ${polyRms[1].toFixed(4)}, order2 RMS = ${polyRms[2].toFixed(4)}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Inverse transforms and round trips
// ─────────────────────────────────────────────────────────────────────────────

section('inverse transforms — round trips')

// --- Test 3a: TPS round trip returns to the original coordinate ---
group('3a', () => {
  const worst = Math.max(...ctrlPts1.map(p => dist(georef.georefInverseTPS(georef.georefTPS(p)), p)))
  assert('3a: TPS → inverse TPS returns to the source point', worst < 1e-6,
    `max round-trip error = ${worst.toExponential(3)}`)
})

// --- Test 3b: TIN round trip, which relies on the shared forward/inverse
//     triangle topology introduced in v0.1.4 ---
group('3b', () => {
  const worst = Math.max(...ctrlPts1.map(p =>
    dist(georef.georefInverseAffineWithTIN(georef.georefAffineWithTIN(p, {}, false), {}, false), p)))
  assert('3b: TIN → inverse TIN returns to the source point', worst < 1e-6,
    `max round-trip error = ${worst.toExponential(3)}`)
})

// --- Test 3c: the fallback pair round trips as well ---
group('3c', () => {
  const worst = Math.max(...ctrlPts1.map(p =>
    dist(georef.georefInverseAffineWithTINFallbackTPS(georef.georefAffineWithTINFallbackTPS(p, {}), {}), p)))
  assert('3c: fallback → inverse fallback returns to the source point', worst < 1e-6,
    `max round-trip error = ${worst.toExponential(3)}`)
})

// --- Test 3d: inverse polynomial round trips within a loose tolerance,
//     since the polynomial is a least-squares fit in both directions ---
group('3d', () => {
  const worst = Math.max(...ctrlPts1.map(p =>
    dist(georef.georefInversePolynomial(georef.georefPolynomial(p, 1), 1), p)))
  assert('3d: order 1 polynomial round trip is stable', Number.isFinite(worst) && worst < 1,
    `max round-trip error = ${worst.toExponential(3)}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Behaviour away from the control points
// ─────────────────────────────────────────────────────────────────────────────

section('interpolation and extrapolation')

/** Centroid of the control points — guaranteed to sit inside the hull. */
const centroid = [
  ctrlPts1.reduce((s, p) => s + p[0], 0) / n,
  ctrlPts1.reduce((s, p) => s + p[1], 0) / n
]

// --- Test 4a: an interior, non-control point transforms finitely everywhere ---
group('4a', () => {
  const extra = {}
  const viaFallback = georef.georefAffineWithTINFallbackTPS(centroid, extra)
  assert('4a: centroid is reported inside the TIN', extra.inside === true, JSON.stringify(extra))
  assert('4a: centroid transforms to a finite coordinate', finite(viaFallback), JSON.stringify(viaFallback))
  assert('4a: TPS agrees it is finite', finite(georef.georefTPS(centroid)))
})

// --- Test 4b: a far-away point is extrapolated via TPS, not via a TIN edge ---
group('4b', () => {
  const spanX = Math.max(...ctrlPts1.map(p => p[0])) - Math.min(...ctrlPts1.map(p => p[0]))
  const spanY = Math.max(...ctrlPts1.map(p => p[1])) - Math.min(...ctrlPts1.map(p => p[1]))
  const far = [centroid[0] - 5 * (spanX || 1), centroid[1] - 5 * (spanY || 1)]

  const extra = {}
  const result = georef.georefAffineWithTINFallbackTPS(far, extra)
  assert('4b: a far point is reported outside the TIN', extra.inside === false, JSON.stringify(extra))
  assert('4b: it is routed to the TPS fallback', extra.usedFallbackTPS === true, JSON.stringify(extra))
  assert('4b: the extrapolated coordinate is finite', finite(result), JSON.stringify(result))
  const tps = georef.georefTPS(far)
  assert('4b: the result is exactly the TPS result', result[0] === tps[0] && result[1] === tps[1])
})

// --- Test 4c: batch mode agrees with per-point calls on real data ---
group('4c', () => {
  const extra = {}
  const batch = georef.georefAffineWithTINFallbackTPS(ctrlPts1, extra)
  assert('4c: batch returns one result per control point', batch.length === n)
  assert('4c: extra.inside is an array of the same length',
    Array.isArray(extra.inside) && extra.inside.length === n)
  const perPoint = ctrlPts1.map(p => georef.georefAffineWithTINFallbackTPS(p, {}))
  assert('4c: batch results match per-point results',
    batch.every((v, i) => v[0] === perPoint[i][0] && v[1] === perPoint[i][1]))
})

console.log('\n══════════════════════════════════════════════════')
console.log(` Results: ${passed} passed, ${failed} failed`)
console.log('══════════════════════════════════════════════════\n')

if (failed > 0) {
  process.exit(1)
}
