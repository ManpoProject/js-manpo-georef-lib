/**
 * Tests for the two critical bug fixes:
 *   1. GeometryLib.geoDistancePointToSegmentArc  (undefined R, lat1, lon1)
 *   2. GeometryLib.getSimilarPoint               (undefined rotateSegmentWithMatrix)
 */

import { GeometryLib, Crs } from './index.js'

let passed = 0
let failed = 0

function assert (description, condition) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${description}`)
    failed++
  }
}

function assertClose (description, actual, expected, tol = 1e-6) {
  const ok = Math.abs(actual - expected) <= tol
  if (ok) {
    console.log(`  ✅ PASS: ${description}  (got ${actual.toFixed(8)})`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${description}  expected ≈ ${expected}, got ${actual}`)
    failed++
  }
}

function assertPointClose (description, actual, expected, tol = 1e-6) {
  const ok = Math.abs(actual[0] - expected[0]) <= tol && Math.abs(actual[1] - expected[1]) <= tol
  if (ok) {
    console.log(`  ✅ PASS: ${description}  (got [${actual[0].toFixed(8)}, ${actual[1].toFixed(8)}])`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${description}  expected [${expected[0]}, ${expected[1]}], got [${actual[0]}, ${actual[1]}]`)
    failed++
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. geoDistancePointToSegmentArc
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: geoDistancePointToSegmentArc')
console.log('══════════════════════════════════════════════════')

// Segment: roughly east-west along the equator from lon=0 to lon=1, lat=0
const segStart = [0, 0]   // [lon, lat]
const segEnd = [1, 0]

// --- Test 1a: point is before segment start (closest point should be segStart) ---
// p is due west of segStart — the perpendicular foot falls before the segment
{
  const p = [-0.5, 0]
  const [dist, pm] = GeometryLib.geoDistancePointToSegmentArc(p, segStart, segEnd)
  const refDist = GeometryLib.geoDistance(p, segStart)
  assertClose('1a: point before start  — dist matches geoDistance(p, segStart)', dist, refDist, 1)
  assertPointClose('1a: point before start  — nearest point is segStart', pm, segStart, 1e-9)
}

// --- Test 1b: point is past segment end (closest point should be segEnd) ---
{
  const p = [1.5, 0]
  const [dist, pm] = GeometryLib.geoDistancePointToSegmentArc(p, segStart, segEnd)
  const refDist = GeometryLib.geoDistance(p, segEnd)
  assertClose('1b: point past end      — dist matches geoDistance(p, segEnd)', dist, refDist, 1)
  assertPointClose('1b: point past end      — nearest point is segEnd', pm, segEnd, 1e-9)
}

// --- Test 1c: point is to the side of the middle of the segment (the previously broken branch) ---
// p is directly north of the midpoint lon=0.5, at lat=0.01 (~1.1 km north)
// The nearest point on the segment should be approximately [0.5, 0]
// and the distance should be ~geoDistance([0.5, 0.01], [0.5, 0]) ≈ 1111 m
{
  const p = [0.5, 0.01]
  let dist, pm
  try {
    ;[dist, pm] = GeometryLib.geoDistancePointToSegmentArc(p, segStart, segEnd)
    assert('1c: mid-segment branch  — does not throw', true)
    // The cross-track distance to the equator segment should be close to geoDistance([0.5,0.01],[0.5,0])
    const approxExpected = GeometryLib.geoDistance([0.5, 0.01], [0.5, 0])
    assertClose('1c: mid-segment branch  — dist ≈ cross-track distance', dist, approxExpected, 500) // within 500m
    // Nearest point should have lat ≈ 0
    assertClose('1c: mid-segment branch  — nearest point lat ≈ 0', pm[1], 0, 0.001)
    // Nearest point lon should be between 0 and 1
    assert('1c: mid-segment branch  — nearest point lon in [0, 1]', pm[0] >= 0 && pm[0] <= 1)
  } catch (e) {
    assert(`1c: mid-segment branch  — does not throw (got: ${e.message})`, false)
    failed++  // also count the sub-assertions as failed
    failed += 3
  }
}

// --- Test 1d: degenerate — point exactly on the segment (dist should be ~0) ---
{
  const p = [0.5, 0]
  const [dist, pm] = GeometryLib.geoDistancePointToSegmentArc(p, segStart, segEnd)
  assertClose('1d: point on segment   — dist ≈ 0', dist, 0, 100) // within 100m (spherical approx)
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. getSimilarPoint
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: getSimilarPoint')
console.log('══════════════════════════════════════════════════')

// --- Test 2a: p === seg1[0]  →  result should be seg2[0] ---
{
  const seg1 = [[0, 0], [1, 0]]
  const seg2 = [[10, 20], [20, 20]]
  let res
  try {
    res = GeometryLib.getSimilarPoint([0, 0], seg1, seg2)
    assert('2a: p at seg1 start     — does not throw', true)
    assertPointClose('2a: p at seg1 start     — returns seg2[0]', res, [10, 20], 1e-9)
  } catch (e) {
    assert(`2a: p at seg1 start     — does not throw (got: ${e.message})`, false)
  }
}

// --- Test 2b: p === seg1[1]  (collinear forward, ratio=1)  →  result should be seg2[1] ---
{
  const seg1 = [[0, 0], [2, 0]]
  const seg2 = [[10, 20], [14, 20]]
  let res
  try {
    res = GeometryLib.getSimilarPoint([2, 0], seg1, seg2)
    assert('2b: p at seg1 end       — does not throw', true)
    assertPointClose('2b: p at seg1 end       — returns seg2[1]', res, [14, 20], 1e-8)
  } catch (e) {
    assert(`2b: p at seg1 end       — does not throw (got: ${e.message})`, false)
  }
}

// --- Test 2c: p is the midpoint of seg1  →  result should be midpoint of seg2 ---
{
  const seg1 = [[0, 0], [2, 0]]
  const seg2 = [[0, 0], [4, 0]]
  let res
  try {
    res = GeometryLib.getSimilarPoint([1, 0], seg1, seg2)
    assert('2c: p midpoint of seg1  — does not throw', true)
    assertPointClose('2c: p midpoint of seg1  — returns midpoint of seg2', res, [2, 0], 1e-8)
  } catch (e) {
    assert(`2c: p midpoint of seg1  — does not throw (got: ${e.message})`, false)
  }
}

// --- Test 2d: 90° rotation — p is perpendicular to seg1 above seg1[0] ---
// seg1: from (0,0) to (1,0).  v1 = [1,0].
// p = (0,1) → v2 = [0,1] → angle = 90°, norm2/norm1 = 1.
// Applying to seg2 = [[0,0],[0,1]] (pointing up):
//   sCos = dot(v1,v2)/|v1|² = 0/1 = 0
//   sSin = cross(v1,v2)/|v1|² = 1/1 = 1
//   w = seg2[1]-seg2[0] = [0,1]
//   result = seg2[0] + [0*0-1*1, 0*1+1*0] = [0,0] + [-1, 0] = [-1, 0]
{
  const seg1 = [[0, 0], [1, 0]]
  const seg2 = [[0, 0], [0, 1]]
  let res
  try {
    res = GeometryLib.getSimilarPoint([0, 1], seg1, seg2)
    assert('2d: 90° rotation        — does not throw', true)
    assertPointClose('2d: 90° rotation        — result = [-1, 0]', res, [-1, 0], 1e-8)
  } catch (e) {
    assert(`2d: 90° rotation        — does not throw (got: ${e.message})`, false)
  }
}

// --- Test 2e: same-scale, no rotation — p is collinear beyond seg1[1] ---
// seg1: (0,0)→(1,0), p=(3,0) → ratio=3, angle=0
// seg2: (10,0)→(12,0) len=2 → expected = (10 + 3*2, 0) = (16, 0)
{
  const seg1 = [[0, 0], [1, 0]]
  const seg2 = [[10, 0], [12, 0]]
  let res
  try {
    res = GeometryLib.getSimilarPoint([3, 0], seg1, seg2)
    assert('2e: collinear beyond p  — does not throw', true)
    assertPointClose('2e: collinear beyond p  — result = [16, 0]', res, [16, 0], 1e-8)
  } catch (e) {
    assert(`2e: collinear beyond p  — does not throw (got: ${e.message})`, false)
  }
}

// --- Test 2f: identical seg1 points should throw ---
{
  try {
    GeometryLib.getSimilarPoint([1, 0], [[0, 0], [0, 0]], [[10, 0], [20, 0]])
    assert('2f: identical seg1 pts  — throws Error', false)
  } catch (e) {
    assert('2f: identical seg1 pts  — throws Error', e instanceof Error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: georefTriangleForPoint (console.log removed)')
console.log('══════════════════════════════════════════════════')

// Setup: four control points forming a simple quadrilateral,
// giving two triangles via manual triangulation:
//   Triangle 0: pts[0], pts[1], pts[2]  →  [[0,0],[2,0],[1,2]]
//   Triangle 1: pts[0], pts[2], pts[3]  →  [[0,0],[1,2],[0,2]]
const triPts = [[0, 0], [2, 0], [1, 2], [0, 2]]
const triangles = [[0, 1, 2], [0, 2, 3]]
const centroids = triangles.map(t => GeometryLib.triangleCentroid(triPts.map((_, i) => triPts[t[i]])))

// --- Test 3a: point clearly inside triangle 0 — returns [0, true], no console output ---
{
  const p = [1, 0.5] // well inside triangle 0
  // Capture console.log to detect any rogue logging
  const logs = []
  const origLog = console.log
  console.log = (...args) => logs.push(args.join(' '))

  const [idx, inside] = GeometryLib.georefTriangleForPoint(triangles, triPts, centroids, p, Crs.Simple)

  console.log = origLog
  assert('3a: inside tri0 — inside = true', inside === true)
  assert('3a: inside tri0 — idx = 0', idx === 0)
  assert('3a: inside tri0 — no console.log output', logs.length === 0)
}

// --- Test 3b: point clearly inside triangle 1 — returns [1, true], no console output ---
{
  const p = [0.3, 1.8] // well inside triangle 1
  const logs = []
  const origLog = console.log
  console.log = (...args) => logs.push(args.join(' '))

  const [idx, inside] = GeometryLib.georefTriangleForPoint(triangles, triPts, centroids, p, Crs.Simple)

  console.log = origLog
  assert('3b: inside tri1 — inside = true', inside === true)
  assert('3b: inside tri1 — idx = 1', idx === 1)
  assert('3b: inside tri1 — no console.log output', logs.length === 0)
}

// --- Test 3c: point outside all triangles — returns [nearestIdx, false], no console output ---
{
  const p = [5, 5] // far outside
  const logs = []
  const origLog = console.log
  console.log = (...args) => logs.push(args.join(' '))

  const [idx, inside] = GeometryLib.georefTriangleForPoint(triangles, triPts, centroids, p, Crs.Simple)

  console.log = origLog
  assert('3c: outside all — inside = false', inside === false)
  assert('3c: outside all — idx is valid index (0 or 1)', idx === 0 || idx === 1)
  assert('3c: outside all — no console.log output', logs.length === 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. affineTransformInversePoint — cached matrix inverse
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: affineTransformInversePoint (cached inv)')
console.log('══════════════════════════════════════════════════')

// Build a simple affine matrix: 45° rotation + translation
// tri1: (0,0),(2,0),(0,2)  →  tri2: (10,10),(14,10),(10,14)
const tri1 = [[0, 0], [2, 0], [0, 2]]
const tri2 = [[10, 10], [14, 10], [10, 14]]
const affineMatrix = GeometryLib.affineParamsOfTriangle(tri1, tri2)

// --- Test 4a: forward then inverse returns original point ---
{
  const original = [1, 0.5]
  const forward = GeometryLib.affineTransformPoint(original, affineMatrix)
  const back = GeometryLib.affineTransformInversePoint(forward, affineMatrix)
  assertPointClose('4a: forward then inverse — recovers original point', back, original, 1e-8)
}

// --- Test 4b: cache is populated after the first call ---
{
  // Start clean
  if (GeometryLib._invCache) GeometryLib._invCache.delete(affineMatrix)

  assert('4b: before 1st call — cache has no entry', !GeometryLib._invCache?.has(affineMatrix))
  GeometryLib.affineTransformInversePoint([1, 0.5], affineMatrix)
  assert('4b: after 1st call  — cache has entry', GeometryLib._invCache?.has(affineMatrix))
}

// --- Test 4c: repeated calls return the exact same cached object (no recomputation) ---
{
  if (GeometryLib._invCache) GeometryLib._invCache.delete(affineMatrix)

  GeometryLib.affineTransformInversePoint([1, 0.5], affineMatrix)
  const cachedInv = GeometryLib._invCache.get(affineMatrix)

  GeometryLib.affineTransformInversePoint([0.5, 1], affineMatrix)
  GeometryLib.affineTransformInversePoint([0.8, 0.8], affineMatrix)
  const cachedInvAgain = GeometryLib._invCache.get(affineMatrix)

  assert('4c: same matrix, 3 calls — cached object is identical (===)', cachedInv === cachedInvAgain)
}

// --- Test 4d: two distinct matrix objects each get their own cache entry ---
{
  const tri3 = [[0, 0], [3, 0], [0, 3]]
  const tri4 = [[5, 5], [8, 5], [5, 8]]
  const otherMatrix = GeometryLib.affineParamsOfTriangle(tri3, tri4)

  if (GeometryLib._invCache) GeometryLib._invCache.delete(affineMatrix)
  if (GeometryLib._invCache) GeometryLib._invCache.delete(otherMatrix)

  GeometryLib.affineTransformInversePoint([1, 1], affineMatrix)
  GeometryLib.affineTransformInversePoint([1, 1], otherMatrix)

  const inv1 = GeometryLib._invCache.get(affineMatrix)
  const inv2 = GeometryLib._invCache.get(otherMatrix)

  assert('4d: two matrices — both have cache entries', inv1 != null && inv2 != null)
  assert('4d: two matrices — cached inverses are different objects', inv1 !== inv2)
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. TPS kernel — pow(norm()) replaced with dx*dx+dy*dy
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: TPS kernel (dx*dx+dy*dy)')
console.log('══════════════════════════════════════════════════')

import { PointGeoreferencer } from './index.js'

// Control points: a simple warping from a unit square to a slightly skewed quad
const srcPts = [[0, 0], [1, 0], [1, 1], [0, 1], [0.5, 0.5]]
const dstPts = [[0, 0], [2, 0], [2.1, 2], [0.1, 2], [1.05, 1.0]]
const georef = new PointGeoreferencer(srcPts, dstPts, Crs.Simple, Crs.Simple)

// --- Test 5a: TPS interpolates exactly through all control points ---
// TPS is an exact interpolant: transforming a control point must return its target exactly.
for (let i = 0; i < srcPts.length; i++) {
  const result = georef.georefTPS(srcPts[i])
  assertPointClose(
    `5a[${i}]: TPS exact at control point ${JSON.stringify(srcPts[i])}`,
    result, dstPts[i], 1e-6
  )
}

// --- Test 5b: TPS inverse interpolates exactly through all control points ---
for (let i = 0; i < dstPts.length; i++) {
  const result = georef.georefInverseTPS(dstPts[i])
  assertPointClose(
    `5b[${i}]: inverse TPS exact at control point ${JSON.stringify(dstPts[i])}`,
    result, srcPts[i], 1e-6
  )
}

// --- Test 5c: TPS forward+inverse round-trip for a non-control point ---
{
  const p = [0.3, 0.7]
  const forward = georef.georefTPS(p)
  const back = georef.georefInverseTPS(forward)
  assert('5c: round-trip non-control point — does not return null', back !== null)
  assertPointClose('5c: round-trip non-control point — recovers original', back, p, 1e-6)
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(` Results: ${passed} passed, ${failed} failed`)
console.log('══════════════════════════════════════════════════\n')

// ─────────────────────────────────────────────────────────────────────────────
// 6. trianglesInTIN — loop condition i < len (was i < len - 2)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: trianglesInTIN (loop condition)')
console.log('══════════════════════════════════════════════════')

// For N points in general position, Delaunay triangulation produces 2N-2-h
// triangles (h = hull points). For a simple convex set, h = N, so T = N-2.
// We just verify count > 0 and every index is valid.

// --- Test 6a: 4 points → 2 triangles (square corners) ---
{
  const pts = [[0, 0], [1, 0], [1, 1], [0, 1]]
  const tin = GeometryLib.generateTIN(pts)
  const triangles = GeometryLib.trianglesInTIN(tin)
  assert('6a: 4 pts — triangle count > 0', triangles.length > 0)
  assert('6a: 4 pts — each triangle has 3 vertices', triangles.every(t => t.length === 3))
  assert('6a: 4 pts — all indices in [0, 3]', triangles.every(t => t.every(idx => idx >= 0 && idx <= 3)))
  // trianglesLen must equal 3 × triangle count
  assert('6a: 4 pts — trianglesLen = 3 × count', tin.trianglesLen === triangles.length * 3)
}

// --- Test 6b: 5 points — verify count and completeness ---
{
  const pts = [[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]
  const tin = GeometryLib.generateTIN(pts)
  const triangles = GeometryLib.trianglesInTIN(tin)
  assert('6b: 5 pts — triangle count > 0', triangles.length > 0)
  assert('6b: 5 pts — trianglesLen = 3 × count', tin.trianglesLen === triangles.length * 3)
  assert('6b: 5 pts — all indices in [0, 4]', triangles.every(t => t.every(idx => idx >= 0 && idx <= 4)))
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. propOfPointOnLinestring — lodashsum called once (not twice)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: propOfPointOnLinestring')
console.log('══════════════════════════════════════════════════')

// Polyline: (0,0) → (1,0) → (2,0) — two equal segments each length 1, total length 2
const line = [[0, 0], [1, 0], [2, 0]]

// --- Test 7a: point at the very start of segment 0 → prop = 0 ---
{
  const prop = GeometryLib.propOfPointOnLinestring([0, 0], line, 0, Crs.Simple)
  assertClose('7a: point at line start → prop = 0', prop, 0, 1e-10)
}

// --- Test 7b: point at the midpoint of segment 0 (x=0.5) → prop = 0.25 ---
{
  const prop = GeometryLib.propOfPointOnLinestring([0.5, 0], line, 0, Crs.Simple)
  assertClose('7b: midpoint of seg 0  → prop = 0.25', prop, 0.25, 1e-10)
}

// --- Test 7c: point at the join of seg 0 and seg 1 (x=1) → prop = 0.5 ---
{
  const prop = GeometryLib.propOfPointOnLinestring([1, 0], line, 0, Crs.Simple)
  assertClose('7c: junction (x=1)     → prop = 0.5', prop, 0.5, 1e-10)
}

// --- Test 7d: point at the midpoint of segment 1 (x=1.5) → prop = 0.75 ---
{
  const prop = GeometryLib.propOfPointOnLinestring([1.5, 0], line, 1, Crs.Simple)
  assertClose('7d: midpoint of seg 1  → prop = 0.75', prop, 0.75, 1e-10)
}

// --- Test 7e: point at the very end (x=2) → prop = 1 ---
{
  const prop = GeometryLib.propOfPointOnLinestring([2, 0], line, 1, Crs.Simple)
  assertClose('7e: point at line end  → prop = 1', prop, 1, 1e-10)
}

// ─────────────────────────────────────────────────────────────────────────────
// B2. nearestPointOnSegment — degenerate segment (p1 === p2) no longer returns NaN
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: nearestPointOnSegment (degenerate segment)')
console.log('══════════════════════════════════════════════════')

// --- Test B2a: p1 === p2 — returns p1, no NaN ---
{
  const result = GeometryLib.nearestPointOnSegment([3, 4], [1, 2], [1, 2])
  assert('B2a: degenerate segment — result is not NaN', !isNaN(result[0]) && !isNaN(result[1]))
  assertPointClose('B2a: degenerate segment — returns p1', result, [1, 2], 1e-10)
}

// --- Test B2b: normal segment still works correctly ---
{
  const result = GeometryLib.nearestPointOnSegment([0, 1], [0, 0], [2, 0])
  assertPointClose('B2b: normal segment — nearest is foot of perpendicular', result, [0, 0], 1e-10)
}

// --- Test B2c: point past the end of segment — clamps to p2 ---
{
  const result = GeometryLib.nearestPointOnSegment([5, 0], [0, 0], [2, 0])
  assertPointClose('B2c: past end — clamps to p2', result, [2, 0], 1e-10)
}

console.log('\n══════════════════════════════════════════════════')
// ─────────────────────────────────────────────────────────────────────────────
// P1. farthestTwoPoints — squared distance for Simple CRS (no sqrt)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════')
console.log(' Tests: farthestTwoPoints (Simple CRS)')
console.log('══════════════════════════════════════════════════')

// --- Test P1a: obvious farthest pair is the diagonal ---
{
  // Points at corners of a rectangle; farthest = (0,0)↔(3,4) (dist=5), not (0,0)↔(3,0) (dist=3)
  const pts = [[0, 0], [3, 0], [3, 4], [0, 4]]
  const [i, j] = GeometryLib.farthestTwoPoints(pts, Crs.Simple)
  const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
  assertClose('P1a: farthest distance = 5 (diagonal of 3×4 rect)', d, 5, 1e-10)
}

// --- Test P1b: collinear points — farthest is first and last ---
{
  const pts = [[0, 0], [1, 0], [2, 0], [5, 0]]
  const [i, j] = GeometryLib.farthestTwoPoints(pts, Crs.Simple)
  const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
  assertClose('P1b: collinear — farthest distance = 5', d, 5, 1e-10)
}

// --- Test P1c: result indices are valid ---
{
  const pts = [[1, 2], [3, 4], [5, 6], [7, 8]]
  const [i, j] = GeometryLib.farthestTwoPoints(pts, Crs.Simple)
  assert('P1c: indices are distinct', i !== j)
  assert('P1c: indices are in range', i >= 0 && i < 4 && j >= 0 && j < 4)
}

console.log('\n══════════════════════════════════════════════════')
console.log(` Results: ${passed} passed, ${failed} failed`)
console.log('══════════════════════════════════════════════════\n')

if (failed > 0) {
  process.exit(1)
}


