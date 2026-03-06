# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [0.1.4] — 2026-03-06

### Fixed

- **`georefInverseAffineWithTIN` now uses the same triangle connectivity as the forward TIN.**
  Previously, the inverse TIN ran a separate Delaunay triangulation on `ctrlPts2`, producing
  different triangle connectivity. This caused points mapped forward via triangle A to be
  mapped back via a different triangle B, leading to visually incorrect results (the transformed
  point landing outside the expected triangle). The inverse TIN now reuses the forward TIN's
  triangle indices, with centroids recomputed in `ctrlPts2` space and affine parameters
  computed in the reverse direction.

---

## [0.1.3] — 2026-03-06

### ⚠️ Breaking Change

- **`georefAffineWithTIN` and `georefInverseAffineWithTIN` argument order changed.**
  The `extra` object is now the **second** argument (moved before `handle_exception`):
  ```js
  // Before (v0.1.2 and earlier)
  georef.georefAffineWithTIN(pt, handle_exception, extra)

  // After (v0.1.3+) — extra is now 2nd
  georef.georefAffineWithTIN(pt, extra, handle_exception)
  ```
  If you were passing only `pt` with no extra arguments, nothing changes.

### Added

- **`extra.flippedTriangle`** flag on `georefAffineWithTIN` and `georefInverseAffineWithTIN`.
  Set to `true` when the point falls inside a TIN triangle whose local affine mapping
  performs an orientation flip (reflection) between the two coordinate systems.
  The transformed coordinates are still geometrically correct; this flag is informational.
- **`GeometryLib.flippedTriangleIndices(triangles, vertices1, vertices2)`** — new static
  helper that returns a `Set<number>` of triangle indices whose signed areas differ in
  sign between the two coordinate spaces.
- **`PointGeoreferencer.georefTIN1FlippedIndices`** and **`georefTIN2FlippedIndices`** —
  public `Set<number>` fields populated by `_computeForwardTIN` / `_computeInverseTIN`
  respectively, listing the indices of flipped triangles.

---

## [0.1.2] — 2026-03-03

### Fixed
- Fixed an issue where `dist/bundle.js` was accidentally excluded from the NPM registry publication due to `.gitignore` rules.

---

## [0.1.1] — 2026-03-02

### Added
- **`ProjectionLib`**: Lightweight Map Projection Utilities.
  - Adds `wgs84ToUTM(lon, lat, zone)` and `utmToWGS84(x, y, zone, isNorthernHemisphere)` to allow users to pre-project geographic coordinates to a flat metric Cartesian plane.
  - This provides an explicit workflow to completely avoid affine transformation rotation/shear distortions when georeferencing over high latitudes or very large map areas.

---

## [0.1.0] — 2026-03-02

### Added

- `InsufficientControlPointsError` — exported typed error thrown when too few control points are supplied for the requested transform (TPS ≥ 3, Polynomial order 1/2/3 ≥ 3/6/10).
- `SingularMatrixError` — exported typed error thrown when the LU decomposition of the control-point matrix fails due to collinear or coincident points.
- `PointGeoreferencer.precompute()` — public method that forces all TIN and triangle data to be computed upfront. Returns `this` for chaining. Recommended for realtime usage where the very first transform call must be fast:
  ```js
  const georef = new PointGeoreferencer(...).precompute()
  ```
- `degsToRads` and `radsToDegs` are now **exported** and can be imported directly by consumers.
- Comprehensive `README.md` with installation, quick-start example, coordinate conventions, full API reference, and benchmark summary.

### Changed

- **`PointGeoreferencer` constructor is now O(1)** — TIN construction (Delaunay triangulation, centroid calculation, affine parameter matrices) is deferred until the first call to the corresponding transform method (`_computeForwardTIN`, `_computeInverseTIN`, `_computeForwardTriangles`, `_computeInverseTriangles`). Use `precompute()` to restore the original eager behaviour.
- **`nearestPoint`** now runs an O(N) linear scan to find the minimum instead of a full O(N log N) sort — no temp array allocated.
- **`georefTriangleForPoint`** uses a two-phase approach: O(N) fast-path checks only the nearest centroid's triangle first; falls back to a sorted scan only for boundary/exterior points.
- **`farthestTwoPoints` (Simple CRS)** compares squared distances instead of calling `Math.hypot`, avoiding N(N-1)/2 square-root computations.
- **`_calculateTPSCoefficients` and `_calculatePolynomialCoefficients`** now call `lup(M)` once and reuse the LU decomposition for both `lusolve` calls, halving the decomposition work.
- **`affineTransformInversePoint`** caches the matrix inverse in a `WeakMap` keyed on the params matrix — repeated calls on the same triangle are ~free.
- **`centroidsOfTriangles`, `sortDistance`, `trianglePointsInTIN`, `affineParamsOfTIN`, `trianglesInTIN`, `affineParamsOfTriangles`** rewritten from `let res=[]; forEach(push)` to idiomatic `.map()`.
- **`PointGeoreferencer` constructor JSDoc** for `crs1` / `crs2` corrected (previously copy-pasted "buffer range" description).
- **`tinOnly` null-checks** simplified: `!== null && === false` → `=== false` (4 occurrences).
- **Batch-dispatch boilerplate** extracted into a single private `_batchOrSingle(pt, extra, fn)` helper used by all four affine transform methods, removing ~80 lines of duplicated code.
- **TPS kernel** replaced `mathjs.pow(mathjs.norm([dx,dy]), 2)` with `dx*dx + dy*dy` and `Math.log(r_sq)` — removes the mathjs call overhead entirely.
- **`propOfPointOnLinestring`** caches the `lodash.sum` result for segment lengths (called once, not twice).

### Fixed

- **`geoDistancePointToSegmentArc`** — fixed undefined variable references and incorrect degrees/radians conversion.
- **`getSimilarPoint`** — fixed call to non-existent internal method and incorrect 2D cross-product computation.
- **`trianglesInTIN`** — loop condition was `i < len - 2` (off-by-one), now `i < len` — last triangle was silently dropped.
- **`nearestPointOnSegment`** — added degenerate-segment guard (`if (som === 0) return p1`) to prevent returning `[NaN, NaN]` when `p1 === p2`.
- **`isTriangleContainsPoint`** — removed redundant array rebuilding; passes original arrays directly to `isPointInTriangle`.
- **`georefTriangleForPoint`** — removed debug `console.log` calls from the hot path.
- **`package.json` test script** — removed erroneous `&& exit 1` that caused all test runs to report failure even on success.
- **`_applyPolynomial`** — unsupported `order` value now throws `RangeError` instead of silently returning `null`.
- All `console.error` / `console.warn` + `return false` patterns in the solver methods replaced with typed throws (`InsufficientControlPointsError`, `SingularMatrixError`).

### Removed

- Unused `mathjs` imports: `norm`, `pow`, `log` (eliminated by TPS kernel rewrite).
- Dead commented-out code blocks throughout `index.js`.
- `Vetices` typos (renamed to `Vertices` internally).

### Performance (20 control points, 980 test points, Geographic → Simple CRS)

| Method | Before | After | Improvement |
|--------|--------|-------|-------------|
| `new PointGeoreferencer()` | ~2.5 ms | ~0 ms (lazy) | instant |
| `new PointGeoreferencer().precompute()` | ~2.5 ms | ~1.8 ms | ~28% faster |
| `georefAffineWithTIN` | 75 ms | 43 ms | ~43% faster |
| `georefTPS` | 8 ms | 0.6 ms | ~92% faster |
| `georefPolynomial(order=1)` | 8.5 ms | 6.2 ms | ~27% faster |

---

## [0.0.13b] — prior baseline

See git tag `v0.0.13b` for the state of the library before this refactoring session.
