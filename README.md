# js-manpo-georef-lib

JavaScript library for **georeferencing** — transforming coordinates between two arbitrary coordinate systems (e.g. geographic lat/lng ↔ pixel/plan coordinates) using a set of user-supplied control points.

[![license](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Coordinate System Conventions](#coordinate-system-conventions)
- [API Reference](#api-reference)
  - [`Crs`](#crs)
  - [`PointGeoreferencer`](#pointgeoreferencer)
  - [`GeometryLib`](#geometrylib)
- [Transform Methods Comparison](#transform-methods-comparison)
- [Building](#building)
- [Testing](#testing)

---

## Overview

The library implements three families of point-to-point transforms:

| Method | Description |
|--------|-------------|
| **Affine with TIN** | Triangulates the control points (Delaunay TIN), then applies a local affine transform inside the triangle that contains each query point. Best accuracy for localised maps. |
| **Thin Plate Spline (TPS)** | Globally smooth interpolant. Exact at control points, smooth everywhere else. |
| **Polynomial** | Polynomial regression of order 1, 2, or 3. Fast, but less accurate at the edges. |

All three also have **inverse** variants that transform in the opposite direction.

---

## Installation

```bash
npm install manpo-georeflib
```

---

## Quick Start

```js
import { PointGeoreferencer, Crs } from 'manpo-georeflib'

// Control points: known pairs of (geographic, pixel) coordinates
const geoPoints = [
  [140.11, 39.70],   // [longitude, latitude]
  [140.15, 39.70],
  [140.15, 39.73],
  [140.11, 39.73],
]
const pixelPoints = [
  [100, 800],        // [x, y] in image pixels
  [900, 800],
  [900, 100],
  [100, 100],
]

// Construct the georeferencer
const georef = new PointGeoreferencer(
  geoPoints,   // source CRS (CRS 1)
  pixelPoints, // target CRS (CRS 2)
  Crs.Geographic,
  Crs.Simple
)

// Transform a single point (geographic → pixel)
const px = georef.georefAffineWithTIN([140.13, 39.71])
console.log(px) // [x, y]

// Transform a batch of points
const geoBatch = [[140.12, 39.71], [140.14, 39.72]]
const pxBatch  = georef.georefAffineWithTIN(geoBatch)

// Transform using TPS for higher accuracy
const pxTPS = georef.georefTPS([140.13, 39.71])

// Inverse: pixel → geographic
const geo = georef.georefInverseAffineWithTIN([500, 450])
```

---

## Coordinate System Conventions

- **Geographic points** are expressed as `[longitude, latitude]` (x-first).
- **Simple / pixel points** are expressed as `[x, y]`.
- Both arrays must be in the **same order** and have the **same length**; a mismatch throws immediately.

---

## API Reference

### `Crs`

An `Enumify` enum representing the two supported coordinate systems.

| Value | Description |
|-------|-------------|
| `Crs.Geographic` | Geographic coordinates: `[longitude, latitude]` in decimal degrees. Distances are computed using the WGS-84 geodesic model. |
| `Crs.Simple` | 2D Cartesian coordinates: `[x, y]`. Distances are Euclidean. |

```js
import { Crs } from 'manpo-georeflib'
console.log(Crs.Geographic) // Crs { }
```

---

### `PointGeoreferencer`

The main class. Constructs a georeferencer from two parallel arrays of control points.

#### Constructor

```js
new PointGeoreferencer(ctrlPts1, ctrlPts2, crs1, crs2, params)
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `ctrlPts1` | `number[][]` | `[]` | Control points in CRS 1, e.g. `[[lng1,lat1], ...]` |
| `ctrlPts2` | `number[][]` | `[]` | Corresponding control points in CRS 2, e.g. `[[x1,y1], ...]` |
| `crs1` | `Crs` | `Crs.Geographic` | Coordinate system of `ctrlPts1` |
| `crs2` | `Crs` | `Crs.Simple` | Coordinate system of `ctrlPts2` |
| `params` | `object\|null` | `null` | Advanced options (see below) |

**Throws** `Error` if `ctrlPts1.length !== ctrlPts2.length`.

##### `params` options

```js
{
  tinOnly: true,   // skip non-TIN triangle data to save memory (disables georefAffineWithTriangleContains)
  forward: {},     // reserved for future per-method options
  inverse: {}      // reserved for future per-method options
}
```

#### Forward transform methods (CRS 1 → CRS 2)

All methods accept either a **single point** `[x, y]` or a **batch** `[[x1,y1], [x2,y2], ...]`.

| Method | Signature | Description |
|--------|-----------|-------------|
| `georefAffineWithTIN` | `(pt, extra?)` | Affine transform using the Delaunay TIN. Most accurate for interior points. |
| `georefAffineWithTriangleContains` | `(pt, extra?)` | Affine using the triangle that explicitly contains the point. |
| `georefTPS` | `(pt)` | Thin Plate Spline interpolation. Exact at control points. |
| `georefPolynomial` | `(pt, order?)` | Polynomial regression. `order` ∈ {1, 2, 3}, default 1. |

`extra` is an optional object; after the call `extra.inside` is set to `true|false` indicating whether the point was inside the TIN.

#### Inverse transform methods (CRS 2 → CRS 1)

| Method | Signature | Description |
|--------|-----------|-------------|
| `georefInverseAffineWithTIN` | `(pt, extra?)` | Inverse affine using the TIN. |
| `georefInverseAffineWithTriangleContains` | `(pt, extra?)` | Inverse affine using containing triangle. |
| `georefInverseTPS` | `(pt)` | Inverse TPS. |
| `georefInversePolynomial` | `(pt, order?)` | Inverse polynomial regression. |

#### Example — checking if a point is inside the TIN

```js
const extra = {}
const result = georef.georefAffineWithTIN([140.13, 39.71], extra)
if (extra.inside) {
  console.log('Transformed (inside TIN):', result)
} else {
  console.log('Extrapolated (outside TIN):', result)
}
```

---

### `GeometryLib`

A static utility class for geometric operations. All methods are `static`.

#### Distance

| Method | Description |
|--------|-------------|
| `geoDistance(p1, p2)` | Geodesic distance between two `[lng, lat]` points (metres). |
| `simpleDistance(p1, p2)` | Euclidean distance between two `[x, y]` points. |
| `distance(p1, p2, crs)` | Dispatches to `geoDistance` or `simpleDistance` based on `crs`. |

#### Nearest / Farthest

| Method | Description |
|--------|-------------|
| `nearestPoint(p, pts, crs)` | Returns `[index, point]` of the nearest point in `pts`. |
| `nearestTwoPoints(p, pts, crs)` | Returns the two nearest points. |
| `nearestThreePoints(p, pts, crs)` | Returns the three nearest points. |
| `farthestTwoPoints(pts, crs)` | Returns `[i, j]` indices of the most distant pair. |
| `sortDistance(p, pts, crs)` | Returns `[[idx, dist], ...]` sorted ascending by distance. |

#### Polyline

| Method | Description |
|--------|-------------|
| `distancePointToLinestring(p, l, crs)` | Distance from point to polyline; returns `[dist, nearestPt, segIdx]`. |
| `linearRefPointOnLinestring(p, l1, l2, crs1, crs2, bf)` | Projects `p` from polyline `l1` onto corresponding polyline `l2`. |
| `propOfPointOnLinestring(p, l, segIdx, crs)` | Length proportion `[0, 1]` of `p` along `l`. |
| `pointOfPropOnLinestring(prop, l, crs)` | Point at proportion `prop` along `l`. |

#### TIN / Triangulation

| Method | Description |
|--------|-------------|
| `generateTIN(pts)` | Builds a Delaunay TIN (returns a `Delaunator` instance). |
| `trianglesInTIN(tin)` | Returns all triangles as `[[i,j,k], ...]`. |
| `pointsInTIN(tin)` | Returns all vertices as `[[x,y], ...]`. |
| `triangleCentroid(points)` | Centroid of three points. |
| `centroidsOfTriangles(triangles, pts)` | Centroids of all triangles. |
| `isTriangleContainsPoint(a, b, c, p)` | Returns `true` if `p` is inside or on triangle `abc`. |

#### Affine

| Method | Description |
|--------|-------------|
| `affineParamsOfTriangle(tri1, tri2)` | Computes the 3×3 affine matrix mapping `tri1` → `tri2`. |
| `affineTransformPoint(p, params)` | Applies an affine transform to a point. |
| `affineTransformInversePoint(p, params)` | Applies the inverse affine transform. |

#### Utilities

```js
import { degsToRads, radsToDegs } from 'manpo-georeflib'

degsToRads(180)  // Math.PI
radsToDegs(Math.PI)  // 180
```

---

## Transform Methods Comparison

Benchmarked on 980 points with 20 control points (Geographic → Simple CRS):

| Method | Notes |
|--------|-------|
| `georefAffineWithTIN` | Fastest for localised, well-sampled maps. ~43% faster than the pre-optimised baseline. |
| `georefTPS` | Most accurate. ~7× faster than the pre-optimised baseline thanks to shared LU decomposition. |
| `georefPolynomial` | Fastest to construct. Accuracy degrades with order ≥ 2 outside the control point hull. |

---

## Building for Browsers

If you're using this library via an npm bundler (Webpack, Vite, Rollup, etc), you don't need to do anything — importing from `manpo-georeflib` automatically resolves the ES module `index.js` and lets your bundler tree-shake and optimize it.

If you need a standalone `<script>` tag version for the browser:

```bash
npm run build   # produces dist/bundle.js (UMD format, ~300KB)
```

---

## Testing

```bash
node --test test-fixes.js test-georeflib.js
```
