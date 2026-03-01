/**
 * benchmark.js
 * Compares OLD (index.old.js, pre-fix) vs NEW (index.js, optimised) performance
 * using dummy-data-1000.json.
 *
 * Control points : first CTRL_PTS_COUNT matched GeoMap↔PlanMap pairs
 * Test points    : remaining (up to 980)
 * Methods        : georefAffineWithTIN, georefTPS, georefPolynomial(1)
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// ─── NEW version (current optimised index.js) ──────────────────────────────
import { PointGeoreferencer as NewGeoreferencer, Crs as NewCrs } from './index.js'

// ─── OLD version (pre-fix, extracted via: git show HEAD~1:index.js > index.old.js)
import { PointGeoreferencer as OldGeoreferencer, Crs as OldCrs } from './index.old.js'

// ─── Load data ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
const raw = JSON.parse(readFileSync(join(__dirname, 'dummy-data-1000.json'), 'utf-8'))

const geoMap = raw['GeoMap']
const planKey = Object.keys(raw).find(k => k !== 'GeoMap')
const planMap = raw[planKey]

geoMap.sort((a, b) => a.id - b.id)
planMap.sort((a, b) => a.id - b.id)

const geoCoords = geoMap.map(p => [p.lng, p.lat])
const planCoords = planMap.map(p => [p.x, p.y])

const CTRL_PTS_COUNT = 20
const ctrlGeo = geoCoords.slice(0, CTRL_PTS_COUNT)
const ctrlPlan = planCoords.slice(0, CTRL_PTS_COUNT)
const testPts = geoCoords.slice(CTRL_PTS_COUNT)

console.log(`\nControl points : ${CTRL_PTS_COUNT}`)
console.log(`Test points    : ${testPts.length}`)
console.log(`Plan map key   : "${planKey}"\n`)

// ─── Helpers ───────────────────────────────────────────────────────────────
function time (fn) {
  const t0 = performance.now()
  fn()
  return performance.now() - t0
}

function bench (label, method, pts) {
  const RUNS = 5
  const ms = []
  for (let r = 0; r < RUNS; r++) {
    ms.push(time(() => { for (const p of pts) method(p) }))
  }
  ms.sort((a, b) => a - b)
  const med = ms[Math.floor(RUNS / 2)]
  const min = ms[0]
  console.log(`  ${label.padEnd(32)} median: ${med.toFixed(1).padStart(7)} ms   min: ${min.toFixed(1).padStart(7)} ms`)
  return med
}

// ─── Construction time benchmark ───────────────────────────────────────────
const CTOR_RUNS = 20
function benchCtor (label, fn) {
  const ms = []
  for (let r = 0; r < CTOR_RUNS; r++) ms.push(time(fn))
  ms.sort((a, b) => a - b)
  const med = ms[Math.floor(CTOR_RUNS / 2)]
  console.log(`  ${label.padEnd(40)} median: ${med.toFixed(2).padStart(7)} ms`)
  return med
}

console.log(`\n══════════════════════════════════════════════════`)
console.log(` Construction time  (${CTOR_RUNS} runs, median)`)
console.log(`══════════════════════════════════════════════════`)
const oCtorMed = benchCtor('OLD new()  (eager, index.old.js)',
  () => new OldGeoreferencer(ctrlGeo, ctrlPlan, OldCrs.Geographic, OldCrs.Simple))
const nLazyMed = benchCtor('NEW new()  (lazy,  index.js)',
  () => new NewGeoreferencer(ctrlGeo, ctrlPlan, NewCrs.Geographic, NewCrs.Simple))
const nEagerMed = benchCtor('NEW new() + precompute()  (index.js)',
  () => new NewGeoreferencer(ctrlGeo, ctrlPlan, NewCrs.Geographic, NewCrs.Simple).precompute())
const lazyGain = ((oCtorMed - nLazyMed) / oCtorMed * 100).toFixed(1)
const eagerGain = ((oCtorMed - nEagerMed) / oCtorMed * 100).toFixed(1)
console.log(`  → lazy  new() is ${lazyGain}% faster than old`)
console.log(`  → eager new()+precompute() is ${eagerGain}% vs old\n`)

// ─── Construct instances for transform benchmark ────────────────────────────
const oldG = new OldGeoreferencer(ctrlGeo, ctrlPlan, OldCrs.Geographic, OldCrs.Simple)
const newG = new NewGeoreferencer(ctrlGeo, ctrlPlan, NewCrs.Geographic, NewCrs.Simple)

// ─── Benchmark ─────────────────────────────────────────────────────────────
const results = []

function section (title, oldFn, newFn) {
  console.log(`══════════════════════════════════════════════════`)
  console.log(` ${title}`)
  console.log(`══════════════════════════════════════════════════`)
  const oMed = bench('OLD (index.old.js)', oldFn, testPts)
  const nMed = bench('NEW (index.js)    ', newFn, testPts)
  const gain = ((oMed - nMed) / oMed * 100).toFixed(1)
  console.log(`  → Speedup: ${gain}%  (positive = new is faster)\n`)
  results.push({ title, gain })
}

section('georefAffineWithTIN',
  p => oldG.georefAffineWithTIN(p),
  p => newG.georefAffineWithTIN(p))

section('georefTPS',
  p => oldG.georefTPS(p),
  p => newG.georefTPS(p))

section('georefPolynomial(order=1)',
  p => oldG.georefPolynomial(p, 1),
  p => newG.georefPolynomial(p, 1))

console.log(`══════════════════════════════════════════════════`)
console.log(` Summary  (${testPts.length} points × 5 runs, median)`)
console.log(`══════════════════════════════════════════════════`)
for (const r of results)
  console.log(`  ${r.title.padEnd(30)} ${r.gain}% faster`)
console.log()
