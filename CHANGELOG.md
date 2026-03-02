# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased] — 2026-03-02

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
