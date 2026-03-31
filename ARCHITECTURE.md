# manpo-georef-lib Internal Architecture (JavaScript)

This document describes the internal structure, geometric paradigms, and logic implemented natively in the JavaScript `manpo-georeflib` repository. It provides insight into the mathematical approach the library uses to align geographic spaces.

## Core Concepts

The `PointGeoreferencer` class (located in `index.js`) is the primary interface. It binds an array of source Geographic/Map control points into mathematical projections targeting a second set of Plan/Pixel points (or vice-versa). 

There are three primary georeferencing algorithms evaluated by this library:
1. **Affine Triangulated Irregular Network (TIN)**
2. **Thin Plate Spline (TPS)**
3. **Polynomial (1st, 2nd, and 3rd order)**

---

## 1. Affine TIN 

Using the `delaunator` library, the framework evaluates the user-supplied control points and generates a non-overlapping mosaic of triangular meshes (Delaunay triangulation). To transform a coordinate dynamically across a grid, the logic follows this workflow:

### Triangle Extent Evaluation
When a coordinate is supplied to `georefAffineWithTIN`:
1. The script first filters for the bounding boxes (`[minX, minY, maxX, maxY]`) of each triangle.
2. If the point falls inside a bounding box, it executes a rigorous Barycentric Point-in-Triangle coordinate test (`isPointInTriangle`).
3. Once the matching triangle is confirmed, the system calculates the geometric inverse affine transformation matrix using elements `{a, b, c, d, e, f}`. These constants dictate exactly how the localized geometry shears and translates from `CRS_1` (e.g. Map) onto `CRS_2` (e.g. Pixel).

Because JavaScript utilizes powerful JIT (Just-In-Time) compilation execution, iterating rigorously through simple arrays and bounds-checks runs extremely efficiently without requiring specialized spatial boundary trees for localized scales.

### Out-of-bounds Extrapolation
If a point evaluates to be completely outside the Delaunay triangular mesh structure (extrapolation):
- The library enters fallback tracking by calculating the geometric distance between the point and the centroids of all available triangles.
- The geometrically nearest triangle boundary acts as the local affine frame to drag the extrapolated coordinate outward relative to the map scale.

*(Depending on the Map CRS flag, the distance computation natively selects Euclidean metrics or employs the `geographiclib-geodesic` implementation to accurately measure Earth's curvature when scanning distances).*

---

## 2. Assured Reciprocity in Inverse TIN

A substantial conceptual challenge with map warping lies in mapping mapping **Target CRS (plan/pixel) → Source CRS (geo)**. 
Because raster maps often contain inherent linear distortions and curves, re-calculating a brand new `delaunator` mesh purely on the output coordinates could create entirely overlapping or disconnected shapes compared to the Forward TIN.

To guarantee perfect mathematical round-trip consistency:
The library does **not** rely on `delaunator` for inverse coordinate arrays.
Instead, it constructs the Inverse TIN explicitly copying the vertex triangle index arrays of the Forward TIN mapping. Thus, if control point indices `[2, 7, 10]` formed the structural skeleton mapping coordinate X to Y, those exact same anchors seamlessly revert Y back to X. 

---

## 3. Thin Plate Spline (TPS)

TPS constructs a matrix-driven algorithm to establish "bending energy." 
Imagine pegging down a flexible rubber sheet strictly at the control points—they match exactly. Between the points, the equation relaxes constraints smoothly, forming organic, globalized warping without sharp triangular boundaries.

The core math uses the separation difference `r` between coordinates to build an evaluated Kernel matrix:
$$K(r) = r^2 \ln(r^2)$$ 

The algorithm bridges the symmetric block matrix with `mathjs` integration. The library depends on JS LU-Factorization (`math.lsolve` and matrix manipulation) to parse coefficients cleanly for interpolation rendering.

---

## 4. Polynomial Transform Integration

Under standard `georefPolynomial`, the system maps the $N$-th degree regression logic (Orders 1, 2, or 3).
Unlike TPS constraints which enforce 100% precision onto the control points, polynomials perform generalized surface regression.

- Using matrices parsed by `mathjs`, variables are bundled into least-squares parameterizations. 
- While polynomial logic struggles at localized fidelity on complex maps with heavily skewed edges, it is extremely resource-light to translate due to the simplicity of polynomial geometry scaling variables. 

---

## 5. Lazy Initialization 

Calculations like Delaunay triangle allocation and Math.js LU solving command specific CPU overhead.
The `PointGeoreferencer` object operates on a **Lazy Initialization Strategy**. 
Calling `new PointGeoreferencer()` computes practically nothing. This allows users to declare instances cleanly across large web applications. Internal computation matrices are exclusively constructed strictly when `georefAffineWithTIN()` or `georefTPS()` natively invoke logic requests. 
To bypass initial-computation lag in runtime benchmarks or UI loading states, the `precompute()` method manually preloads and solves all arrays before testing operations launch.
