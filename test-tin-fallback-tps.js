/**
 * Tests for the TIN-with-TPS-fallback transforms:
 *   1. PointGeoreferencer.georefAffineWithTINFallbackTPS
 *   2. PointGeoreferencer.georefInverseAffineWithTINFallbackTPS
 *
 * Also covers the batch metadata contract of the private `_batchOrSingle`
 * helper these methods rely on (one parallel array per `extra` key).
 *
 * Note: the fallback does NOT promise lower error than raw TIN everywhere —
 * for a well-formed, mildly non-linear grid TPS is sometimes worse. What it
 * promises is a *smooth, global* extrapolant instead of one edge triangle's
 * affine frame, and that the choice is made per point. These tests assert
 * that contract, not an accuracy ranking.
 */

import { PointGeoreferencer, Crs, GeometryLib } from './index.js'

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

function assertPointClose (description, actual, expected, tol = 1e-9) {
  const ok = Array.isArray(actual) && Array.isArray(expected) &&
    Math.abs(actual[0] - expected[0]) <= tol && Math.abs(actual[1] - expected[1]) <= tol
  if (ok) {
    console.log(`  ✅ PASS: ${description}  (got [${actual[0].toFixed(8)}, ${actual[1].toFixed(8)}])`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${description}  expected [${expected}], got [${actual}]`)
    failed++
  }
}

const section = title => {
  console.log('\n══════════════════════════════════════════════════')
  console.log(` Tests: ${title}`)
  console.log('══════════════════════════════════════════════════')
}

/**
 * Runs one block of related assertions. A block that throws is recorded as a
 * failure and the remaining blocks still run — otherwise a single regression
 * (e.g. passing a batch to a single-point-only routine) aborts the whole file
 * and hides every test after it.
 */
function group (label, fn) {
  try {
    fn()
  } catch (err) {
    console.error(`  ❌ FAIL: ${label} — threw ${err?.name ?? 'Error'}: ${err?.message ?? err}`)
    failed++
  }
}

/** 5×5 grid of control points warped by a small non-linear wobble, so that
 *  the TIN and TPS solutions genuinely disagree away from the control points. */
function makeGridGeoreferencer () {
  const src = []
  const dst = []
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      src.push([i, j])
      dst.push([2 * i + 10 + 0.05 * Math.sin(i * j), 2 * j + 20 + 0.05 * Math.cos(i + j)])
    }
  }
  return new PointGeoreferencer(src, dst, Crs.Simple, Crs.Simple)
}

/** 3×3 grid whose centre control point is dragged far away in CRS 2, which
 *  inverts the orientation of the triangles around it (flipped triangles). */
function makeFlippedGeoreferencer () {
  const src = []
  const dst = []
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      src.push([i, j])
      dst.push([i * 10, j * 10])
    }
  }
  const centre = src.findIndex(p => p[0] === 1 && p[1] === 1)
  dst[centre] = [-60, -60]
  return new PointGeoreferencer(src, dst, Crs.Simple, Crs.Simple)
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Forward — single point
// ─────────────────────────────────────────────────────────────────────────────

section('georefAffineWithTINFallbackTPS — single point')

// --- Test 1a: a point inside the hull must keep the TIN result untouched ---
group('1a', () => {
  const g = makeGridGeoreferencer()
  const p = [1.3, 2.7]
  const extra = {}
  const result = g.georefAffineWithTINFallbackTPS(p, extra)
  const tin = g.georefAffineWithTIN(p, {}, false)

  assert('1a: inside hull — extra.inside === true', extra.inside === true, JSON.stringify(extra))
  assert('1a: inside hull — extra.usedFallbackTPS === false', extra.usedFallbackTPS === false, JSON.stringify(extra))
  assertPointClose('1a: inside hull — result is exactly the plain TIN result', result, tin, 0)
})

// --- Test 1b: a point outside the hull must be handed to TPS ---
group('1b', () => {
  const g = makeGridGeoreferencer()
  const p = [-8, -8]
  const extra = {}
  const result = g.georefAffineWithTINFallbackTPS(p, extra)
  const tps = g.georefTPS(p)
  const tin = g.georefAffineWithTIN(p, {}, false)

  assert('1b: outside hull — extra.inside === false', extra.inside === false, JSON.stringify(extra))
  assert('1b: outside hull — extra.usedFallbackTPS === true', extra.usedFallbackTPS === true, JSON.stringify(extra))
  assertPointClose('1b: outside hull — result is exactly the TPS result', result, tps, 0)
  assert('1b: outside hull — TIN and TPS actually disagree (test is meaningful)',
    Math.hypot(tin[0] - tps[0], tin[1] - tps[1]) > 1e-6,
    `TIN=[${tin}] TPS=[${tps}]`)
})

// --- Test 1c: `extra` is optional and must not throw when omitted or null ---
group('1c', () => {
  const g = makeGridGeoreferencer()
  const noExtra = g.georefAffineWithTINFallbackTPS([-8, -8])
  const nullExtra = g.georefAffineWithTINFallbackTPS([-8, -8], null)

  assert('1c: omitted extra — returns a finite point', Number.isFinite(noExtra[0]) && Number.isFinite(noExtra[1]))
  assertPointClose('1c: null extra — same result as omitted extra', nullExtra, noExtra, 0)
})

// --- Test 1d: null / undefined input returns null, matching georefAffineWithTIN ---
group('1d', () => {
  const g = makeGridGeoreferencer()
  assert('1d: null input      — returns null', g.georefAffineWithTINFallbackTPS(null) === null)
  assert('1d: undefined input — returns null', g.georefAffineWithTINFallbackTPS(undefined) === null)
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Forward — flipped triangle (inside the hull, but still falls back)
// ─────────────────────────────────────────────────────────────────────────────

section('georefAffineWithTINFallbackTPS — flipped triangles keep the affine')

// --- Test 2a: the fixture really does produce flipped triangles ---
group('2a', () => {
  const g = makeFlippedGeoreferencer()
  g.georefAffineWithTIN([1, 1], {})   // force the TIN to be built
  assert('2a: fixture yields at least one flipped triangle',
    g.georefTIN1FlippedIndices !== null && g.georefTIN1FlippedIndices.size > 0,
    `indices = ${JSON.stringify([...(g.georefTIN1FlippedIndices || [])])}`)
})

// --- Test 2b: a point inside the hull keeps the affine result even when its
//     triangle is flipped. A flip means the control points describe a fold,
//     which TPS reproduces too — falling back would give up the TIN's locality
//     and exactness for nothing. ---
group('2b', () => {
  const g = makeFlippedGeoreferencer()
  const p = [0.05, 0.05]
  const probe = {}
  g.georefAffineWithTIN(p, probe, false)

  assert('2b: probe point is inside the TIN', probe.inside === true, JSON.stringify(probe))
  assert('2b: probe point is in a flipped triangle', probe.flippedTriangle === true, JSON.stringify(probe))

  const extra = {}
  const result = g.georefAffineWithTINFallbackTPS(p, extra)
  const tin = g.georefAffineWithTIN(p, {}, false)
  const tps = g.georefTPS(p)

  assert('2b: flipped triangle — extra.usedFallbackTPS === false', extra.usedFallbackTPS === false, JSON.stringify(extra))
  assertPointClose('2b: flipped triangle — result is the TIN result, not the TPS one', result, tin, 0)
  assert('2b: flipped triangle — TPS would have given something else',
    Math.hypot(tin[0] - tps[0], tin[1] - tps[1]) > 1e-6,
    `TIN=[${tin}] TPS=[${tps}]`)
  assert('2b: flipped triangle — orientationOutlier is reported as a diagnostic',
    extra.orientationOutlier === true, JSON.stringify(extra))
})

// --- Test 2c: the containment guarantee that makes 2b safe — an affine map
//     preserves barycentric coordinates, so a point inside a source triangle
//     lands inside the corresponding target triangle even when it is flipped. ---
group('2c', () => {
  const g = makeFlippedGeoreferencer()
  g.georefAffineWithTIN([1, 1], {})
  const tris = g.georefTIN1Triangles
  const V1 = g.georefTIN1Vertices
  const V2 = g.ctrlPts2

  const bary = (a, b, c, p) => {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
    const l1 = ((b[1] - c[1]) * (p[0] - c[0]) + (c[0] - b[0]) * (p[1] - c[1])) / d
    const l2 = ((c[1] - a[1]) * (p[0] - c[0]) + (a[0] - c[0]) * (p[1] - c[1])) / d
    return [l1, l2, 1 - l1 - l2]
  }

  let sampled = 0
  let contained = 0
  let maxDrift = 0
  for (const ti of g.georefTIN1FlippedIndices) {
    const [i0, i1, i2] = tris[ti]
    const A1 = V1[i0], B1 = V1[i1], C1 = V1[i2]
    const A2 = V2[i0], B2 = V2[i1], C2 = V2[i2]
    for (let u = 0.1; u < 0.9; u += 0.2) {
      for (let v = 0.1; u + v < 0.95; v += 0.2) {
        const w = 1 - u - v
        const p = [u * A1[0] + v * B1[0] + w * C1[0], u * A1[1] + v * B1[1] + w * C1[1]]
        const e = {}
        const q = g.georefAffineWithTINFallbackTPS(p, e)
        if (e.inside !== true || e.usedFallbackTPS) continue
        const b1 = bary(A1, B1, C1, p)
        const b2 = bary(A2, B2, C2, q)
        maxDrift = Math.max(maxDrift, ...b1.map((x, k) => Math.abs(x - b2[k])))
        sampled++
        if (b2.every(x => x >= -1e-9 && x <= 1 + 1e-9)) contained++
      }
    }
  }

  assert('2c: sampled interior points of flipped triangles', sampled > 0, `sampled = ${sampled}`)
  assert('2c: every one lands inside its corresponding target triangle',
    contained === sampled, `${contained}/${sampled}`)
  assert('2c: barycentric coordinates are preserved through the map',
    maxDrift < 1e-9, `max drift = ${maxDrift.toExponential(3)}`)
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. Forward — batch input
// ─────────────────────────────────────────────────────────────────────────────

section('georefAffineWithTINFallbackTPS — batch input')

// --- Test 3a: a mixed batch decides per point and returns one result per point.
//     Regression guard: a naive implementation that inspects `extra` only after
//     calling georefAffineWithTIN sees arrays (always truthy), sends the whole
//     batch to georefTPS — which is single-point only — and silently returns a
//     short array of nulls. ---
group('3a', () => {
  const g = makeGridGeoreferencer()
  const pts = [[1.3, 2.7], [-8, -8], [3.1, 1.2], [50, 50]]
  const extra = {}
  const results = g.georefAffineWithTINFallbackTPS(pts, extra)

  assert('3a: batch — returns one result per input point', Array.isArray(results) && results.length === 4,
    JSON.stringify(results))
  assert('3a: batch — every result is a finite point',
    results.every(p => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])),
    JSON.stringify(results))
  assert('3a: batch — no result is null', results.every(p => p !== null), JSON.stringify(results))
})

// --- Test 3b: metadata comes back as arrays parallel to the input ---
group('3b', () => {
  const g = makeGridGeoreferencer()
  const pts = [[1.3, 2.7], [-8, -8], [3.1, 1.2], [50, 50]]
  const extra = {}
  g.georefAffineWithTINFallbackTPS(pts, extra)

  assert('3b: batch — extra.inside is an array of 4',
    Array.isArray(extra.inside) && extra.inside.length === 4, JSON.stringify(extra.inside))
  assert('3b: batch — extra.usedFallbackTPS is an array of 4',
    Array.isArray(extra.usedFallbackTPS) && extra.usedFallbackTPS.length === 4, JSON.stringify(extra.usedFallbackTPS))
  assert('3b: batch — extra.flippedTriangle is an array of 4',
    Array.isArray(extra.flippedTriangle) && extra.flippedTriangle.length === 4, JSON.stringify(extra.flippedTriangle))
  assert('3b: batch — inside flags are [true, false, true, false]',
    JSON.stringify(extra.inside) === '[true,false,true,false]', JSON.stringify(extra.inside))
  assert('3b: batch — fallback flags are [false, true, false, true]',
    JSON.stringify(extra.usedFallbackTPS) === '[false,true,false,true]', JSON.stringify(extra.usedFallbackTPS))
})

// --- Test 3c: batch results must equal the per-point results ---
group('3c', () => {
  const g = makeGridGeoreferencer()
  const pts = [[1.3, 2.7], [-8, -8], [3.1, 1.2], [50, 50]]
  const batch = g.georefAffineWithTINFallbackTPS(pts, {})
  const single = pts.map(p => g.georefAffineWithTINFallbackTPS(p, {}))

  assert('3c: batch results are identical to per-point results',
    batch.every((v, i) => v[0] === single[i][0] && v[1] === single[i][1]),
    `${JSON.stringify(batch)} vs ${JSON.stringify(single)}`)
})

// --- Test 3d: a batch with a null extra must still transform every point ---
group('3d', () => {
  const g = makeGridGeoreferencer()
  const results = g.georefAffineWithTINFallbackTPS([[1.3, 2.7], [-8, -8]], null)
  assert('3d: batch with null extra — returns 2 finite points',
    results.length === 2 && results.every(p => Number.isFinite(p[0])), JSON.stringify(results))
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Inverse
// ─────────────────────────────────────────────────────────────────────────────

section('georefInverseAffineWithTINFallbackTPS')

// --- Test 4a: inside the hull, and a round trip returns to the source point ---
group('4a', () => {
  const g = makeGridGeoreferencer()
  const source = [1.3, 2.7]
  const forward = g.georefAffineWithTIN(source, {}, false)
  const extra = {}
  const back = g.georefInverseAffineWithTINFallbackTPS(forward, extra)

  assert('4a: inverse inside — extra.inside === true', extra.inside === true, JSON.stringify(extra))
  assert('4a: inverse inside — extra.usedFallbackTPS === false', extra.usedFallbackTPS === false, JSON.stringify(extra))
  assertPointClose('4a: inverse inside — round trip returns to the source point', back, source, 1e-9)
})

// --- Test 4b: outside the hull, the inverse hands off to the inverse TPS ---
group('4b', () => {
  const g = makeGridGeoreferencer()
  const p = [-100, -100]
  const extra = {}
  const result = g.georefInverseAffineWithTINFallbackTPS(p, extra)
  const tps = g.georefInverseTPS(p)

  assert('4b: inverse outside — extra.inside === false', extra.inside === false, JSON.stringify(extra))
  assert('4b: inverse outside — extra.usedFallbackTPS === true', extra.usedFallbackTPS === true, JSON.stringify(extra))
  assertPointClose('4b: inverse outside — result is exactly the inverse TPS result', result, tps, 0)
})

// --- Test 4c: inverse batch and null/undefined handling ---
group('4c', () => {
  const g = makeGridGeoreferencer()
  const inside = g.georefAffineWithTIN([1.3, 2.7], {}, false)
  const extra = {}
  const results = g.georefInverseAffineWithTINFallbackTPS([inside, [-100, -100]], extra)

  assert('4c: inverse batch — returns 2 finite points',
    results.length === 2 && results.every(p => Number.isFinite(p[0])), JSON.stringify(results))
  assert('4c: inverse batch — fallback flags are [false, true]',
    JSON.stringify(extra.usedFallbackTPS) === '[false,true]', JSON.stringify(extra.usedFallbackTPS))
  assert('4c: inverse null input      — returns null', g.georefInverseAffineWithTINFallbackTPS(null) === null)
  assert('4c: inverse undefined input — returns null', g.georefInverseAffineWithTINFallbackTPS(undefined) === null)
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Backward compatibility of the existing batch `extra` contract
// ─────────────────────────────────────────────────────────────────────────────

section('_batchOrSingle — existing extra contract unchanged')

// --- Test 5a: georefAffineWithTIN batch still reports extra.inside as before ---
group('5a', () => {
  const g = makeGridGeoreferencer()
  const extra = {}
  const results = g.georefAffineWithTIN([[1.3, 2.7], [-8, -8]], extra)

  assert('5a: georefAffineWithTIN batch — returns 2 points', results.length === 2)
  assert('5a: georefAffineWithTIN batch — extra.inside is [true, false]',
    JSON.stringify(extra.inside) === '[true,false]', JSON.stringify(extra.inside))
})

// --- Test 5b: georefAffineWithTriangleContains only ever sets `inside`;
//     its array must still be present and correctly sized ---
group('5b', () => {
  const g = makeGridGeoreferencer()
  const extra = {}
  const results = g.georefAffineWithTriangleContains([[1.3, 2.7], [-8, -8]], extra)

  assert('5b: triangleContains batch — returns 2 finite points',
    results.length === 2 && Number.isFinite(results[0][0]), JSON.stringify(results))
  assert('5b: triangleContains batch — extra.inside is an array of 2',
    Array.isArray(extra.inside) && extra.inside.length === 2, JSON.stringify(extra.inside))
})

// --- Test 5c: single-point calls still receive scalars, not arrays ---
group('5c', () => {
  const g = makeGridGeoreferencer()
  const extra = {}
  g.georefAffineWithTIN([1.3, 2.7], extra, false)

  assert('5c: single point — extra.inside is a boolean, not an array',
    typeof extra.inside === 'boolean', JSON.stringify(extra.inside))
  assert('5c: single point — extra.flippedTriangle is a boolean, not an array',
    typeof extra.flippedTriangle === 'boolean', JSON.stringify(extra.flippedTriangle))
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. A global handedness difference is not a distortion signal
// ─────────────────────────────────────────────────────────────────────────────

section('global handedness (geographic → pixel) is not flagged as an outlier')

/** Geographic control points mapped into pixel space, whose y axis points
 *  down. Every triangle's signed area changes sign, but that is a property of
 *  the two coordinate systems, not distortion of any single triangle. */
function makePixelGeoreferencer () {
  const src = []
  const dst = []
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const lon = 140.05 + i * 0.06
      const lat = 39.65 + j * 0.06
      src.push([lon, lat])
      // north-up scan: increasing latitude means a SMALLER pixel y
      dst.push([200 + i * 500, 1600 - j * 400])
    }
  }
  return new PointGeoreferencer(src, dst, Crs.Geographic, Crs.Simple)
}

// --- Test 6a: the fixture really does flip every triangle ---
group('6a', () => {
  const g = makePixelGeoreferencer()
  g.georefAffineWithTIN([140.11, 39.71], {})
  const total = g.georefTIN1Triangles.length
  const flipped = g.georefTIN1FlippedIndices.size

  assert('6a: every triangle is flagged flipped (global handedness difference)',
    total > 0 && flipped === total, `${flipped}/${total}`)
  assert('6a: but NO triangle is an orientation outlier',
    g.georefTIN1OrientationOutliers.size === 0,
    `outliers = ${g.georefTIN1OrientationOutliers.size}`)
})

// --- Test 6b: interior points keep the TIN result. The fallback keys off
//     containment alone, so this holds regardless of orientation — but it is
//     worth pinning down for the single most common real-world configuration. ---
group('6b', () => {
  const g = makePixelGeoreferencer()
  let interior = 0
  let divertedToTPS = 0
  for (let lon = 140.06; lon < 140.22; lon += 0.01) {
    for (let lat = 39.66; lat < 39.82; lat += 0.01) {
      const extra = {}
      g.georefAffineWithTINFallbackTPS([lon, lat], extra)
      if (extra.inside === true) {
        interior++
        if (extra.usedFallbackTPS) divertedToTPS++
      }
    }
  }
  assert('6b: the sweep actually found interior points', interior > 50, `interior = ${interior}`)
  assert('6b: no interior point is diverted to TPS by handedness alone',
    divertedToTPS === 0, `${divertedToTPS}/${interior} diverted`)
})

// --- Test 6c: extra.flippedTriangle keeps its original v0.1.3 meaning ---
group('6c', () => {
  const g = makePixelGeoreferencer()
  const extra = {}
  g.georefAffineWithTINFallbackTPS([140.11, 39.71], extra)

  assert('6c: flippedTriangle is still reported as true (absolute orientation change)',
    extra.flippedTriangle === true, JSON.stringify(extra))
  // If a plain geo→pixel map reported every triangle as an outlier, the
  // diagnostic would be pure noise and useless for locating bad control points.
  assert('6c: orientationOutlier is false — the diagnostic ignores global handedness',
    extra.orientationOutlier === false, JSON.stringify(extra))
  assert('6c: so the point keeps its TIN result',
    extra.usedFallbackTPS === false, JSON.stringify(extra))
})

// ─────────────────────────────────────────────────────────────────────────────
// 7. Inverse lookup prefers an unflipped triangle where the image folds
// ─────────────────────────────────────────────────────────────────────────────

section('inverse triangle lookup — folded image prefers unflipped cells')

/** Collect every triangle of `tris` (indexed into `verts`) containing `p`. */
function coveringTriangles (tris, verts, p) {
  const hit = []
  tris.forEach((t, i) => {
    if (GeometryLib.isPointInTriangle(verts[t[0]], verts[t[1]], verts[t[2]], p)) hit.push(i)
  })
  return hit
}

// --- Test 7a: the fixture's image really does fold, so several triangles
//     contain the same point and there is a genuine choice to make ---
group('7a', () => {
  const g = makeFlippedGeoreferencer()
  g.georefInverseAffineWithTIN([0, 0], {})
  const T = g.georefTIN2Triangles
  const V = g.georefTIN2Vertices

  let overlapping = 0
  for (let x = -70; x <= 25; x += 1.5) {
    for (let y = -70; y <= 25; y += 1.5) {
      if (coveringTriangles(T, V, [x, y]).length > 1) overlapping++
    }
  }
  assert('7a: the TIN image folds over itself', overlapping > 100, `overlapping probes = ${overlapping}`)
})

// --- Test 7b: wherever an unflipped triangle also contains the point, the
//     lookup must return an unflipped one. Without the flipped set supplied
//     it took a folded-over cell roughly half the time. ---
group('7b', () => {
  const g = makeFlippedGeoreferencer()
  g.georefInverseAffineWithTIN([0, 0], {})
  const T = g.georefTIN2Triangles
  const V = g.georefTIN2Vertices
  const C = g.georefTIN2Centroids
  const F = g.georefTIN2FlippedIndices

  let decidable = 0
  let flippedWithoutSet = 0
  let flippedWithSet = 0
  for (let x = -70; x <= 25; x += 1.5) {
    for (let y = -70; y <= 25; y += 1.5) {
      const p = [x, y]
      const cover = coveringTriangles(T, V, p)
      // Only points where an unflipped alternative genuinely exists.
      if (cover.length < 2 || !cover.some(i => !F.has(i))) continue
      decidable++
      const [without] = GeometryLib.georefTriangleForPoint(T, V, C, p, Crs.Simple)
      const [wit] = GeometryLib.georefTriangleForPoint(T, V, C, p, Crs.Simple, F)
      if (F.has(without)) flippedWithoutSet++
      if (F.has(wit)) flippedWithSet++
    }
  }

  assert('7b: the sweep found points with a real choice', decidable > 100, `decidable = ${decidable}`)
  assert('7b: without the flipped set, flipped cells are picked (old behaviour)',
    flippedWithoutSet > 0, `${flippedWithoutSet}/${decidable}`)
  assert('7b: with the flipped set, a flipped cell is never picked',
    flippedWithSet === 0, `${flippedWithSet}/${decidable} still flipped`)
})

// --- Test 7c: the inverse transform actually passes the flipped set through ---
group('7c', () => {
  const g = makeFlippedGeoreferencer()
  g.georefInverseAffineWithTIN([0, 0], {})
  const T = g.georefTIN2Triangles
  const V = g.georefTIN2Vertices
  const F = g.georefTIN2FlippedIndices

  let checked = 0
  let flippedUsed = 0
  for (let x = -70; x <= 25; x += 3) {
    for (let y = -70; y <= 25; y += 3) {
      const p = [x, y]
      const cover = coveringTriangles(T, V, p)
      if (cover.length < 2 || !cover.some(i => !F.has(i))) continue
      const extra = {}
      g.georefInverseAffineWithTIN(p, extra, false)
      if (extra.inside !== true) continue
      checked++
      // flippedTriangle is reported for whichever triangle the lookup chose,
      // so it doubles as a witness that an unflipped cell was taken.
      if (extra.flippedTriangle === true) flippedUsed++
    }
  }
  assert('7c: the sweep exercised the inverse transform', checked > 20, `checked = ${checked}`)
  assert('7c: no inverse result came from a flipped triangle where a clean one existed',
    flippedUsed === 0, `${flippedUsed}/${checked}`)
})

// --- Test 7d: backward compatibility — with no flipped triangles at all, or
//     with no set supplied, the lookup behaves exactly as it did before ---
group('7d', () => {
  const g = makePixelGeoreferencer()
  g.georefInverseAffineWithTIN([500, 800], {})
  const T = g.georefTIN2Triangles
  const V = g.georefTIN2Vertices
  const C = g.georefTIN2Centroids
  const F = g.georefTIN2OrientationOutliers

  let same = 0
  let total = 0
  for (let x = 250; x < 1600; x += 90) {
    for (let y = 300; y < 1550; y += 90) {
      const p = [x, y]
      const a = GeometryLib.georefTriangleForPoint(T, V, C, p, Crs.Simple)
      const b = GeometryLib.georefTriangleForPoint(T, V, C, p, Crs.Simple, F)
      total++
      if (a[0] === b[0] && a[1] === b[1]) same++
    }
  }
  assert('7d: a normal geo→pixel TIN has no orientation outliers', F.size === 0, `${F.size}`)
  assert('7d: passing the set changes nothing there', same === total, `${same}/${total}`)
})

console.log('\n══════════════════════════════════════════════════')
console.log(` Results: ${passed} passed, ${failed} failed`)
console.log('══════════════════════════════════════════════════\n')

if (failed > 0) {
  process.exit(1)
}
