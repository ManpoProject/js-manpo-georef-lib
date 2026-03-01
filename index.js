import GeographicLib from 'geographiclib-geodesic'
import Delaunator from 'delaunator'
import lodashsum from 'lodash/sum.js'
import * as mathjs from 'mathjs'
import { lusolve, lup, multiply, transpose } from 'mathjs'
import { Enumify } from 'enumify'

const geodesic = GeographicLib.Geodesic.WGS84

/**
 * @summary convert degrees to radians
 * @param {number} deg degrees
 * @returns {number} radians
 */
export const degsToRads = deg => (deg * Math.PI) / 180.0

/**
 * @summary convert radians to degrees
 * @param {number} rad radians
 * @returns {number} degrees
 */
export const radsToDegs = rad => rad * 180 / Math.PI

export class Crs extends Enumify {
  static Geographic = new Crs()
  static Simple = new Crs()
  static _ = this.closeEnum()
}

export class GeometryLib {

  static R = 6371000 // radius of the earth

  /**
   * @summary Calculate the distance of two geographic points
   * @param {number[]} p1 1st point, [lon1, lat1]
   * @param {number[]} p2 2nd point, [lon2, lat2]
   * @returns {number} distance in meters
   */
  static geoDistance (p1, p2) {
    const r = geodesic.Inverse(p1[1], p1[0], p2[1], p2[0])
    return r.s12
  }

  /**
   * @summary Calculate the distance of two 2D points
   * @param {number[]} p1 1st point, [x1, y1]
   * @param {number[]} p2 2nd point, [x2, y2]
   * @returns {number} distance
   */
  static simpleDistance (p1, p2) {
    return Math.hypot(p1[0] - p2[0], p1[1] - p2[1])
  }

  /**
   * @summary Calculate the distance of two 2D points
   * @param {number[]} p1 1st point, [x1, y1]
   * @param {number[]} p2 2nd point, [x2, y2]
   * @param {Crs} crs the coordinate system of the points
   * @returns {number} distance
   */
  static distance (p1, p2, crs) {
    if (crs === Crs.Geographic) {
      return this.geoDistance(p1, p2)
    } else {
      return this.simpleDistance(p1, p2)
    }
  }

  /**
   * @summary Calculate the centroid of a triangle
   * @param {number[][]} points three points of the triangle, in the form [[x1, y1], [x2, y2], [x3, y3]]
   * @returns {number[]} the centroid point [x, y]
   */
  static triangleCentroid (points) {
    const x = (points[0][0] + points[1][0] + points[2][0]) / 3
    const y = (points[0][1] + points[1][1] + points[2][1]) / 3
    return [x, y]
  }

  static centroidsOfTriangles (triangles, pts) {
    return triangles.map(tri => this.triangleCentroid(this.trianglePoints(tri, pts)))
  }

  /**
   * @summary Calculate the distances from the point (p) to each of the points in (pts), then sort them in ascending order
   * @param {number[]} p the point [x, y]
   * @param {number[][]} pts the points [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {number[][]} array of the sorted distances with the index of the corresponded point, [[idx1, dist1], [idx2, dist2], ...]
   */
  static sortDistance (p, pts, crs) {
    const distFn = crs === Crs.Geographic
      ? pt => this.geoDistance(p, pt)
      : pt => this.simpleDistance(p, pt)
    return pts.map((pt, idx) => [idx, distFn(pt)]).sort((a, b) => a[1] - b[1])
  }

  /**
   * @summary Find the nearest point in (pts) to the point (p)
   * @param {number[]} p the point like [lon, lat] or [x, y]
   * @param {number[][]} pts the points like [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {Array} the nearest point [nearestPointIndex, [nearest_lon, nearest_lat]]
   */
  static nearestPoint (p, pts, crs) {
    if (pts === undefined || pts === null) {
      return [-1, null]
    }
    if (pts.length === 1) {
      return [0, pts[0]]
    }
    const distFn = crs === Crs.Geographic
      ? (a, b) => this.geoDistance(a, b)
      : (a, b) => this.simpleDistance(a, b)
    let bestIdx = 0
    let bestDist = distFn(p, pts[0])
    for (let i = 1; i < pts.length; i++) {
      const d = distFn(p, pts[i])
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    return [bestIdx, pts[bestIdx]]
  }

  /**
   * @summary Find the nearest two points in (pts) to the point (p)
   * @param {number[]} p the point like [lon, lat] or [x, y]
   * @param {number[][]} pts the points like [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {Array} the nearest two point [nearestIndex, 2nd_nearestIndex, [nearest_lon, nearest_lat], [2nd_nearest_lon, 2nd_nearest_lat]]
   */
  static nearestTwoPoints (p, pts, crs) {
    if (pts === undefined || pts === null) {
      return [-1, -1, null, null]
    }
    if (pts.length === 1) {
      return [0, -1, pts[0], null]
    }
    const distArr = this.sortDistance(p, pts, crs)
    return [
      distArr[0][0],
      distArr[1][0],
      pts[distArr[0][0]],
      pts[distArr[1][0]]
    ]
  }

  /**
   * @summary Find the nearest three points in (pts) to the point (p)
   * @param {number[]} p the point [lon, lat] or [x, y]
   * @param {number[][]} pts the points [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {Array} the nearest three points
   * [nearestIndex, 
   * 2nd_nearestIndex, 
   * 3rd_nearestIndex, 
   * [nearest_lon, nearest_lat], 
   * [2nd_nearest_lon, 2nd_nearest_lat],
   * [3rd_nearest_lon, 3rd_nearest_lat]]
   */
  static nearestThreePoints (p, pts, crs) {
    if (pts === undefined || pts === null) {
      return [-1, -1, -1, null, null, null]
    }
    if (pts.length === 1) {
      return [0, -1, -1, pts[0], null, null]
    }
    const distArr = this.sortDistance(p, pts, crs)
    if (pts.length === 2) {
      return [
        distArr[0][0],
        distArr[1][0],
        -1,
        pts[distArr[0][0]],
        pts[distArr[1][0]],
        null
      ]
    }
    return [
      distArr[0][0],
      distArr[1][0],
      distArr[2][0],
      pts[distArr[0][0]],
      pts[distArr[1][0]],
      pts[distArr[2][0]]
    ]
  }

  /**
   * @summary The fastest two points among an array of points
   * @param {number[][]} pts points like [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {number[]} [idx1, idx2] the indices of the two points in the original array
   */
  static farthestTwoPoints (pts, crs) {
    const count = pts.length
    let maxVal = -1, idx1 = -1, idx2 = -1
    if (crs === Crs.Geographic) {
      // Geographic: must use real distances (geodesic.Inverse is the bottleneck, not the loop)
      for (let i = 0; i < count - 1; i++) {
        for (let j = i + 1; j < count; j++) {
          const dist = this.geoDistance(pts[i], pts[j])
          if (dist > maxVal) { maxVal = dist; idx1 = i; idx2 = j }
        }
      }
    } else {
      // Simple: compare squared distances — monotonic, avoids N(N-1)/2 sqrt calls
      for (let i = 0; i < count - 1; i++) {
        for (let j = i + 1; j < count; j++) {
          const dx = pts[i][0] - pts[j][0], dy = pts[i][1] - pts[j][1]
          const distSq = dx * dx + dy * dy
          if (distSq > maxVal) { maxVal = distSq; idx1 = i; idx2 = j }
        }
      }
    }
    return [idx1, idx2]
  }

  /**
   * @summary generate a TIN with Delaunator from points
   * @param {number[][]} pts points to generate the TIN
   * @returns {Delaunator} a Delaunator object of the TIN
   */
  static generateTIN (pts) {
    return new Delaunator(this.pointsToCoords(pts))
  }

  /**
   * @summary get the vertices of a triangle in the TIN
   * @param {number[]} tri the triangle, defined as point indices of the vertices [pt_idx0, pt_idx1, pt_idx2]
   * @param {Delaunator} tin the TIN, which is a Delaunator instance
   * @returns {number[][]} points of the triangle [[x0, y0], [x1, y1], [x2, y2]]
   */
  static trianglePointsInTIN (tri, tin) {
    return tri.map(p => this.pointInCoordsByIndex(p, tin.coords))
  }

  /**
   * @summary convert the array of coordinates [x1, y1, x2, y2, ...] to array of points [[x1, y1], [x2, y2], ...]
   * @param {number[]} coords [x1, y1, x2, y2, ...]
   * @returns {number[][]} [[x1, y1], [x2, y2], ...]
   */
  static coordsToPoints (coords) {
    if (coords === undefined || coords === null) {
      return []
    }
    let pts = []
    for (let i = 0; i < coords.length - 1; i += 2) {
      pts.push([coords[i], coords[i + 1]])
    }
    return pts
  }

  /**
   * @summary get the points [x, y] in the TIN
   * @param {Delaunator} tin the TIN, which is a Delaunator instance
   * @returns {number[][]} [[x1, y1], [x2, y2], ...]
   */
  static pointsInTIN (tin) {
    return this.coordsToPoints(tin.coords)
  }

  /**
   * @summary get the triangles in a TIN which have certain vertex defined by point index
   * @param {number} idx point index of the vertex
   * @param {Delaunator} tin the TIN, which is a Delaunator instance
   * @returns {number[][]} triangles that contain the vertex, in the form of [[pt_idx0, pt_idx1, pt_idx2], ...]
   */
  static trianglesIncludeVertexIndexInTIN (idx, tin) {
    const tri = this.trianglesInTIN(tin)
    return this.trianglesIncludeVertexIndex(idx, tri)
  }

  /**
   * @summary get the triangles which have certain vertex defined by point index
   * @param {number} idx point index of the vertex
   * @param {number[][]} triangles point indices of the vertices of the triangles [[pt_idx0, pt_idx1, pt_idx2], ...]
   * @returns {number[][]} triangles that contain the vertex, in the form of [[pt_idx0, pt_idx1, pt_idx2], ...]
   */
  static trianglesIncludeVertexIndex (idx, triangles) {
    let res = []
    for (let i = 0; i < triangles.length; i++) {
      if (triangles[i].includes(idx)) {
        res.push([i, triangles[i]])
      }
    }
    return res
  }

  /**
   * @summary find the nearest triangle (whose centroid is the nearest) in the TIN to a point
   * @param {number[]} p [x, y] or [lon, lat]
   * @param {Delaunator} tin a Delaunator object of the TIN
   * @param {Crs} crs the coordinate system of the points
   * @returns {number} the index of the triangle in the triangles' list of the TIN
   */
  static nearestTriangleInTIN (p, tin, crs) {
    // 1. find the nearest point in TIN
    const [nearest_index, nearest_point] = this.nearestPoint(p, this.pointsInTIN(tin), crs)
    // 2. get the triangles related to the point
    let tri = this.trianglesIncludeVertexIndexInTIN(nearest_index, tin)
    // 3. calculate the center of the triangles
    let dists = []
    if (crs === Crs.Geographic) {
      tri.forEach((t) => {
        dists.push([t, this.geoDistance(p, this.triangleCentroid(this.trianglePointsInTIN(t, tin)))])
      })
    } else {
      tri.forEach((t) => {
        dists.push([t, this.simpleDistance(p, this.triangleCentroid(this.trianglePointsInTIN(t, tin)))])
      })
    }
    // 4. find the nearest centroid
    dists.sort((a, b) => {
      return a[1] - b[1]
    })
    return dists[0][0]
  }

  /**
   * @summary find the nearest triangle (whose centroid is the nearest) in the triangles to a point
   * @param {number[]} p the point [x, y] or [lon, lat]
   * @param {number[][]} triangles indices of vertices of each triangle
   * @param {number[][]} vertices coordinates of vertices
   * @param {Crs} crs the coordinate system of the points
   * @returns {number} the index of the triangle in the triangles' list
   */
  static nearestTriangleIndex (p, triangles, vertices, crs) {
    // 1. find the nearest point in TIN
    const [nearest_index, nearest_point] = this.nearestPoint(p, vertices, crs)
    // 2. get the triangles related to the point
    let tri = this.trianglesIncludeVertexIndex(nearest_index, triangles)
    // 3. calculate the center of the triangles
    let dists = []
    if (crs === Crs.Geographic) {
      tri.forEach((t) => {
        const triVertices = [vertices[t[1][0]], vertices[t[1][1]], vertices[t[1][2]]]
        dists.push([t[0], this.geoDistance(p, this.triangleCentroid(triVertices))])
      })
    } else {
      tri.forEach((t) => {
        const triVertices = [vertices[t[1][0]], vertices[t[1][1]], vertices[t[1][2]]]
        dists.push([t[0], this.simpleDistance(p, this.triangleCentroid(triVertices))])
      })
    }
    // 4. find the nearest centroid
    dists.sort((a, b) => {
      return a[1] - b[1]
    })
    return dists[0][0]
  }

  /**
   * @summary Calculate the distance from a point to a line segment in geographic coordinates
   * @param {number[]} p the point [lon, lat]
   * @param {number[]} p1 1st point of the segment [lon1, lat1]
   * @param {number[]} p2 2nd point of the segment [lon2, lat2]
   * @returns {number[]} the distance and the nearest point on the segment [dist, pm]
   */
  static geoDistancePointToSegmentArc (p, p1, p2) {
    const inv12 = geodesic.Inverse(p1[1], p1[0], p2[1], p2[0])
    const bear12 = inv12.azi1
    const inv13 = geodesic.Inverse(p1[1], p1[0], p[1], p[0])
    const bear13 = inv13.azi1
    const dis13 = inv13.s12
    let diff = Math.abs(bear13 - bear12)
    if (diff > 180) {
      diff = 360 - diff
    }
    if (diff > 90) {
      return [dis13, p1]
    } else {
      const dxt = Math.asin(Math.sin(dis13 / GeometryLib.R) * Math.sin(degsToRads(bear13 - bear12))) * GeometryLib.R
      const dis12 = inv12.s12
      const dis14 = Math.acos(Math.cos(dis13 / GeometryLib.R) / Math.cos(dxt / GeometryLib.R)) * GeometryLib.R
      if (dis14 > dis12) {
        const dis23 = geodesic.Inverse(p2[1], p2[0], p[1], p[0]).s12
        return [dis23, p2]
      } else {
        const direct12 = geodesic.Direct(p1[1], p1[0], bear12, dis14)
        const pm = [direct12.lon2, direct12.lat2]
        return [Math.abs(dxt), pm]
      }
    }
  }

  /**
   * @summary Calculate the distance from a point to a line segment in 2D coordinates
   * @param {number[]} p the point [x, y]
   * @param {number[]} p1 1st point of the segment [x1, y1]
   * @param {number[]} p2 2nd point of the segment [x2, y2]
   * @returns {number[]} the distance and the nearest point on the segment [dist, pm]
   */
  static simpleDistancePointToSegment (p, p1, p2) {
    const nearest = this.nearestPointOnSegment(p, p1, p2)
    return [this.simpleDistance(p, nearest), nearest]
  }

  /**
   * @summary Find the nearest point on a line segment from a point in 2D coordinates
   * @param {number[]} p the point [x, y]
   * @param {number[]} p1 1st point of the segment [x1, y1]
   * @param {number[]} p2 2nd point of the segment [x2, y2]
   * @returns {number[]} the nearest point on the segment [nearest_x, nearest_y]
   */
  static nearestPointOnSegment (p, p1, p2) {
    const px = p2[0] - p1[0]
    const py = p2[1] - p1[1]
    const som = px * px + py * py
    if (som === 0) return p1  // degenerate segment: p1 and p2 are the same point
    const u = ((p[0] - p1[0]) * px + (p[1] - p1[1]) * py) / som
    if (u >= 1) {
      return p2
    }
    if (u <= 0) {
      return p1
    }
    return [p1[0] + px * u, p1[1] + py * u]
  }

  /**
   * @summary Calculate the distance from a point to a polyline
   * @param {number[]} p the point [lon, lat] or [x, y]
   * @param {number[][]} l the polyline [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {Array} the distance, the nearest point and the segment index 
   * [dist, [nearest_x, nearest_y], segment_index]
   * @throws an error if the parameters are illegal
   */
  static distancePointToLinestring (p, l, crs) {
    if (p === undefined || p === null || p.length < 2) {
      throw new Error("Not a legal point")
    }
    if (l === undefined || l === null || l.length < 2) {
      throw new Error("Not a legal line")
    }
    let distArr = []
    if (crs === Crs.Geographic) {
      for (let i = 0; i < l.length - 1; i++) {
        distArr.push([i, this.geoDistancePointToSegmentArc(p, l[i], l[i + 1])])
      }
    } else {
      for (let i = 0; i < l.length - 1; i++) {
        distArr.push([i, this.simpleDistancePointToSegment(p, l[i], l[i + 1])])
      }
    }
    distArr.sort((a, b) => {
      return a[1][0] - b[1][0]
    })
    return [distArr[0][1][0], distArr[0][1][1], distArr[0][0]]
  }

  /**
   * @summary Calculate lengths of all the segments in a polyline in geographic coordinates
   * @param {number[][]} l [[lon1, lat1], [lon2, lat2], ...]
   * @returns {number[]} array of the distances [dist1, dist2, ...]
   */
  static segmentLengthsOfGeoLinestring (l) {
    let distArr = []
    for (let i = 0; i < l.length - 1; i++) {
      distArr.push(this.geoDistance(l[i], l[i + 1]))
    }
    return distArr
  }

  /**
   * @summary Calculate lengths of all the segments in a polyline in 2D coordinates
   * @param {number[][]} l [[x1, y1], [x2, y2], ...]
   * @returns {number[]} array of the distances [dist1, dist2, ...]
   */
  static segmentLengthsOfSimpleLinestring (l) {
    let distArr = []
    for (let i = 0; i < l.length - 1; i++) {
      distArr.push(this.simpleDistance(l[i], l[i + 1]))
    }
    return distArr
  }

  /**
   * @summary Find the linear referenced point on a 2D polyline corresponded to a geo point against a geo polyline within a given buffer range
   * @param {number[]} p geo point [lon, lat]
   * @param {number[][]} polyline1 1st polyline, such as [[lon1, lat1], [lon2, lat2], ...]
   * @param {number[][]} polyline2 2nd polyline, such as [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs1 the coordinate system of polyline1
   * @param {Crs} crs2 the coordinate system of polyline2
   * @param {number} bf buffer range (in meters)
   * @returns {Array} the referenced point and the geo distance from the point to the polyline, [[x, y], dist]
   */
  static linearRefPointOnLinestring (p, polyline1, polyline2, crs1, crs2, bf) {
    const [dist, pm, segIdx] = this.distancePointToLinestring(p, polyline1, crs1)
    if (dist > bf) {
      return [null, Infinity]
    }
    const prop = this.propOfPointOnLinestring(pm, polyline1, segIdx, crs1)
    return [this.pointOfPropOnLinestring(prop, polyline2, crs2), dist]
  }

  /**
   * @summary Calculate the length proportion of the point on the polyline in geographic coordinates
   * @param {number[]} p the point [lon, lat]
   * @param {number[][]} l the polyline [[lon1, lat1], [lon2, lat2], ...]
   * @param {number} segIdx the index of the segment that the point is on
   * @param {Crs} crs the coordinate system of the points
   * @returns {number} the proportion in the range [0, 1]
   */
  static propOfPointOnLinestring (p, l, segIdx, crs) {
    const segLens = (crs === Crs.Geographic) ? this.segmentLengthsOfGeoLinestring(l) : this.segmentLengthsOfSimpleLinestring(l)
    const totalLen = lodashsum(segLens)
    const refLen = lodashsum(segLens.slice(0, segIdx)) + this.distance(l[segIdx], p, crs)
    return refLen / totalLen
  }

  /**
   * @summary Find the point on the polyline of a certain length proportion in 2D coordinates
   * @param {number} prop the proportion in the range [0, 1]
   * @param {number[][]} l the polyline [[x1, y1], [x2, y2], ...]
   * @returns {number[]} the point [x, y]
   */
  static pointOfPropOnSimpleLinestring (prop, l) {
    if (prop <= 0) {
      return l[0]
    }
    if (prop >= 1) {
      return l[l.length - 1]
    }
    const segLens = this.segmentLengthsOfSimpleLinestring(l)
    const sumLen = lodashsum(segLens)
    const refLen = sumLen * prop
    let currentLen = 0
    for (let i = 0; i < segLens.length; i++) {
      currentLen += segLens[i]
      if (currentLen > refLen) {
        const d = currentLen - refLen
        const r = d / segLens[i]
        const dx = l[i + 1][0] - l[i][0]
        const dy = l[i + 1][1] - l[i][1]
        return [l[i + 1][0] - dx * r, l[i + 1][1] - dy * r]
      }
    }
    return l[l.length - 1]
  }

  /**
   * @summary Find the point on the polyline of a certain length proportion in geographic coordinates
   * @param {number} prop the proportion in the range [0, 1]
   * @param {number[][]} l the polyline [[lon1, lat1], [lon2, lat2], ...]
   * @returns {number[]} the point [lon, lat]
   */
  static pointOfPropOnGeoLinestring (prop, l) {
    if (prop <= 0) {
      return l[0]
    }
    if (prop >= 1) {
      return l[l.length - 1]
    }
    const segLens = this.segmentLengthsOfGeoLinestring(l)
    const sumLen = lodashsum(segLens)
    const refLen = sumLen * prop
    let currentLen = 0
    for (let i = 0; i < segLens.length; i++) {
      currentLen += segLens[i]
      if (currentLen > refLen) {
        const d = currentLen - refLen
        const r = d / segLens[i]
        const inv = geodesic.Inverse(l[i][1], l[i][0], l[i + 1][1], l[i + 1][0])
        const direct = geodesic.Direct(l[i][1], l[i][0], inv.azi1, inv.s12 * r)
        return [direct.lon2, direct.lat2]
      }
    }
    return l[l.length - 1]
  }

  /**
   * @summary Find the point on the polyline of a certain length proportion in geographic coordinates
   * @param {number} prop the proportion in the range [0, 1]
   * @param {number[][]} l the polyline [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {number[]} the point [lon, lat] or [x, y]
   */
  static pointOfPropOnLinestring (prop, l, crs) {
    if (crs === Crs.Geographic) {
      return this.pointOfPropOnGeoLinestring(prop, l)
    } else {
      return this.pointOfPropOnSimpleLinestring(prop, l)
    }
  }

  /**
   * @summary Calculate parameters for affine transform of triangles in TIN in different coordinates
   * @param {Delaunator} tin TIN object
   * @param {number[][]} pts the points in the other coordinates
   * @returns {mathjs.Matrix[]} array of parameters for all the triangles
   */
  static affineParamsOfTIN (tin, pts) {
    return this.trianglesInTIN(tin).map(tri =>
      this.affineParamsOfTriangle(this.trianglePointsInTIN(tri, tin), this.trianglePoints(tri, pts)))
  }

  /**
   * @summary convert the array of points [[x1, y1], [x2, y2], ...] to array of coordinates [x1, y1, x2, y2, ...]
   * @param {number[][]} pts [[x1, y1], [x2, y2], ...]
   * @returns {number[]} [x1, y1, x2, y2, ...]
   */
  static pointsToCoords (pts) {
    if (pts === undefined || pts === null) {
      return []
    }
    let coords = []
    for (const p of pts) {
      coords.push(...p)
    }
    return coords
  }

  /**
   * @summary get the all the triangles in the TIN by as point indices of the vertices
   * @param {Delaunator} tin the TIN, which is a Delaunator instance
   * @returns {number[][]} point indices of the vertices of the triangles [[pt_idx0, pt_idx1, pt_idx2], ...]
   */
  static trianglesInTIN (tin) {
    const t = tin.triangles
    const len = tin.trianglesLen
    return Array.from({ length: len / 3 }, (_, i) => [t[i * 3], t[i * 3 + 1], t[i * 3 + 2]])
  }

  /**
   * @summary get the vertices of a triangle
   * @param {number[]} tri the triangle, defined as point indices of the vertices [pt_idx0, pt_idx1, pt_idx2]
   * @param {number[][]} pts the points [[x, y], ...]
   * @returns {number[][]} points of the triangle [[x0, y0], [x1, y1], [x2, y2]]
   */
  static trianglePoints (tri, pts) {
    return [pts[tri[0]], pts[tri[1]], pts[tri[2]]]
  }

  /**
   * @summary get a point [x, y] by index in the array of coordinates [x0, y0, x1, y1, ...]
   * @param {number} idx start from 0
   * @param {number[]} coords coordinates [x0, y0, x1, y1, ...]
   * @returns {number[]} idx = i => [xi, yi]
   */
  static pointInCoordsByIndex (idx, coords) {
    return [coords[idx * 2], coords[idx * 2 + 1]]
  }

  /**
   * @summary Calculate the affine transformed coordinates of the point with the params
   * @param {number[]} p the point to transform [lon, lat], or [x, y]
   * @param {mathjs.Matrix} t the matrix of params for affine transform
   * @returns {number[]} transformed point [u, v]
   */
  static affineTransformPoint (p, t) {
    const p_homogeneous = mathjs.matrix([p[0], p[1], 1]);
    const p_transformed = mathjs.multiply(t, p_homogeneous);
    return [p_transformed.get([0]), p_transformed.get([1])];
  }

  /**
   * @summary Calculate the inverse affine transformed coordinates of the point with the params
   * @param {number[]} p the point to transform [lon, lat], or [x, y]
   * @param {mathjs.Matrix} t the matrix of params for inverse affine transform
   * @returns {number[]} inversed point [u, v]
   */
  static affineTransformInversePoint (p, t) {
    // Cache the inverted matrix keyed by the matrix object to avoid
    // recomputing mathjs.inv() on every call when transforming batches of points.
    if (!GeometryLib._invCache) GeometryLib._invCache = new WeakMap()
    let t_inv = GeometryLib._invCache.get(t)
    if (!t_inv) {
      t_inv = mathjs.inv(t)
      GeometryLib._invCache.set(t, t_inv)
    }
    return this.affineTransformPoint(p, t_inv)
  }

  /**
   * @summary Calculate the corresponded point to a segment with similarity transform from a point and a segment in another coordinate system
   * @param {number[]} p the point, like [lon, lat]
   * @param {number[][]} seg1 the segment, like [[lon1, lat1], [lon2, lat2]]
   * @param {number[][]} seg2 the segment, like [[x1, y1], [x2, y2]]
   * @returns {number[]} transformed point [x, y]
   */
  static getSimilarPoint (p, seg1, seg2) {
    const v1 = mathjs.subtract(seg1[1], seg1[0])
    const v2 = mathjs.subtract(p, seg1[0])
    const norm1 = mathjs.norm(v1), norm2 = mathjs.norm(v2)
    if (mathjs.abs(norm1) < 1e-10) {
      throw new Error('The two geo-ref points are the same')
    }
    if (mathjs.abs(norm2) < 1e-10) {
      return seg2[0]
    }
    const dot = mathjs.dot(v1, v2)
    // 2D cross product: z-component of v1 × v2 (mathjs.cross requires 3D vectors)
    const cross = v1[0] * v2[1] - v1[1] * v2[0]
    // Scale factor = norm2 / norm1; combined cos/sin already divided by norm1*norm2,
    // so multiply by norm2² to get the scaled rotation applied to seg2's vector.
    const norm1sq = norm1 * norm1
    const sCos = dot / norm1sq   // (norm2/norm1) * cos(angle)
    const sSin = cross / norm1sq // (norm2/norm1) * sin(angle)
    const w = mathjs.subtract(seg2[1], seg2[0])
    // Apply rotated+scaled offset to seg2[0]
    return [
      seg2[0][0] + w[0] * sCos - w[1] * sSin,
      seg2[0][1] + w[0] * sSin + w[1] * sCos
    ]
  }


  /**
 * @summary Generate triangles for affine transform from corresponded geo points and 2D points
 * @param {number[][]} ctrlPts1 [[lon1, lat1], [lon2, lat2], ...]
 * @param {number[][]} ctrlPts2 [[x1, y1], [x2, y2], ...]
 * @returns {number[][]} point indices of each triangle [[triIdx1-1, triIdx1-2, triIdx1-3], [...], ...]
 */
  static generateTrianglesFromGeorefPoints (ctrlPts1, ctrlPts2) {
    let res = [];
    const count = ctrlPts1.length;
    const epsilon = 1e-10;

    for (let a = 0; a < count - 2; a++) {
      for (let b = a + 1; b < count - 1; b++) {
        for (let c = b + 1; c < count; c++) {
          // Using destructuring to improve readability
          const [x0, y0] = ctrlPts1[a];
          const [x1, y1] = ctrlPts1[b];
          const [x2, y2] = ctrlPts1[c];
          const [u0, v0] = ctrlPts2[a];
          const [u1, v1] = ctrlPts2[b];
          const [u2, v2] = ctrlPts2[c];

          // Collinearity check for geo points
          if (Math.abs((y1 - y0) * (x2 - x0) - (y2 - y0) * (x1 - x0)) < epsilon) continue;
          // Collinearity check for 2D points
          if (Math.abs((v1 - v0) * (u2 - u0) - (v2 - v0) * (u1 - u0)) < epsilon) continue;

          // Check if any other point is inside the triangle
          let inside = false;
          for (let i = 0; i < count; i++) {
            if (i === a || i === b || i === c) continue;
            if (this.isPointInTriangle([x0, y0], [x1, y1], [x2, y2], ctrlPts1[i])) {
              inside = true;
              break;
            }
          }
          if (inside) continue;

          res.push([a, b, c]);
        }
      }
    }
    return res;
  }

  /**
   * Efficient point-in-triangle test using barycentric coordinates
   */
  static isPointInTriangle ([x0, y0], [x1, y1], [x2, y2], [px, py]) {
    const dX = px - x2;
    const dY = py - y2;
    const dX21 = x2 - x1;
    const dY12 = y1 - y2;
    const D = dY12 * (x0 - x2) + dX21 * (y0 - y2);
    const s = dY12 * dX + dX21 * dY;
    const t = (y2 - y0) * dX + (x0 - x2) * dY;

    if (D < 0) return s <= 0 && t <= 0 && s + t >= D;
    return s >= 0 && t >= 0 && s + t <= D;
  }



  /**
   * @summary Get the proper triangle (indices of the three vertices) for affine transform the point p
   * @param {number[][]} triangles indices of vertices of each triangle
   * @param {number[][]} points coordinates of control points
   * @param {number[][]} centroids centroids of triangles
   * @param {number[]} p the point to be transformed
   * @param {Crs} crs the coordinate system of the points
   * @returns {[number, boolean]} the index of the triangle to be used for transformation and the point is inside the triangle or not
   */
  static georefTriangleForPoint (triangles, points, centroids, p, crs) {
    // Compute distances to all centroids once (O(N), unavoidable)
    const geo = crs === Crs.Geographic
    const distArr = centroids.map((c, i) => [i, geo ? this.geoDistance(p, c) : this.simpleDistance(p, c)])

    // Fast path: find the nearest centroid with a linear scan (no sort)
    // then check only that triangle. For points inside the TIN this almost
    // always succeeds, skipping the O(N log N) sort entirely.
    let nearestEntry = distArr[0]
    for (let i = 1; i < distArr.length; i++) {
      if (distArr[i][1] < nearestEntry[1]) nearestEntry = distArr[i]
    }
    const nearestTri = triangles[nearestEntry[0]]
    if (this.isTriangleContainsPoint(points[nearestTri[0]], points[nearestTri[1]], points[nearestTri[2]], p)) {
      // console.log('Triangle index: ' + nearestEntry[0])
      return [nearestEntry[0], true]
    }

    // Fallback: sort and check remaining triangles in order of distance.
    // Reached only for points near triangle boundaries or outside the hull.
    distArr.sort((a, b) => a[1] - b[1])
    for (let i = 0; i < distArr.length; i++) {
      if (distArr[i][0] === nearestEntry[0]) continue  // already checked above
      const tri = triangles[distArr[i][0]]
      if (this.isTriangleContainsPoint(points[tri[0]], points[tri[1]], points[tri[2]], p)) {
        // console.log('Triangle index: ' + distArr[i][0])
        return [distArr[i][0], true]
      }
    }
    // console.log('No triangle includes the point')
    return [distArr[0][0], false]
  }


  /**
   * @summary Find a triangle that contains the point in a list of triangles
   * @param {number[][]} triangles indices of vertices of each triangle
   * @param {number[][]} vertices coordinates of vertices
   * @param {number[]} p the point
   * @returns {number|null} the index of the triangle, or null if no such triangle
   */
  static triangleIndexContainsPoint (triangles, vertices, p) {
    let i = 0
    for (i = 0; i < triangles.length; i++) {
      const tri = triangles[i]
      if (this.isTriangleContainsPoint(vertices[tri[0]], vertices[tri[1]], vertices[tri[2]], p)) return i
    }
    return null
  }

  /**
   * @summary Calculate parameters for affine transform from tri1 to tri2
   * @param {number[][]} tri1 the triangle [[x0, y0], [x1, y1], [x2, y2]]
   * @param {number[][]} tri2 the triangle [[u0, v0], [u1, v1], [u2, v2]]
   * @returns {mathjs.Matrix} matrix of the parameters for affine transform [m1, m2, m3, m4, tx, ty]
   */
  static affineParamsOfTriangle (tri1, tri2) {
    const aug1 = mathjs.matrix([
      [tri1[0][0], tri1[1][0], tri1[2][0]],
      [tri1[0][1], tri1[1][1], tri1[2][1]],
      [1, 1, 1]
    ])
    const aug2 = mathjs.matrix([
      [tri2[0][0], tri2[1][0], tri2[2][0]],
      [tri2[0][1], tri2[1][1], tri2[2][1]],
      [1, 1, 1]
    ])
    const inv1 = mathjs.inv(aug1)
    const t = mathjs.multiply(aug2, inv1)
    return t
  }

  /**
   * @summary Calculate parameters for affine transform of triangles different coordinates
   * @param {number[][]} triangles indices of vertices of each triangle
   * @param {number[][]} ctrlPts1 georef points in the 1st CRS, like [[lon1, lat1], [lon2, lat2], ...]
   * @param {number[][]} ctrlPts2 georef points in the 2nd CRS, like, [[x1, y1], [x2, y2], ...]
   * @returns {mathjs.Matrix[]} array of parameter matrices for all the triangles
   */
  static affineParamsOfTriangles (triangles, ctrlPts1, ctrlPts2) {
    return triangles.map(tri => this.affineParamsOfTriangle(
      [ctrlPts1[tri[0]], ctrlPts1[tri[1]], ctrlPts1[tri[2]]],
      [ctrlPts2[tri[0]], ctrlPts2[tri[1]], ctrlPts2[tri[2]]]
    ))
  }

  /**
   * @summary Check if the point p is inside the triangle abc
   * @param {number[]} a vertex of the triangle [x1, y1]
   * @param {number[]} b vertex of the triangle [x2, y2]
   * @param {number[]} c vertex of the triangle [x3, y3]
   * @param {number[]} p the point p [x, y]
   * @returns {boolean} true if p is inside abc, false if not
   */
  static isTriangleContainsPoint (a, b, c, p) {
    return this.isPointInTriangle(a, b, c, p)
  }
}

export class PointGeoreferencer {
  /**
   * @param {number[][]} ctrlPts1 coordinates of control points in CRS1
   * @param {number[][]} ctrlPts2 coordinates of control points in CRS2
   * @param {Crs} crs1 coordinate reference system of ctrlPts1 (default: Crs.Geographic)
   * @param {Crs} crs2 coordinate reference system of ctrlPts2 (default: Crs.Simple)
   * @returns {PointGeoreferencer}
   */
  constructor (ctrlPts1 = [], ctrlPts2 = [], crs1 = Crs.Geographic, crs2 = Crs.Simple, params = null) {
    this.ctrlPts1 = (ctrlPts1) ? ctrlPts1 : []
    this.ctrlPts2 = (ctrlPts2) ? ctrlPts2 : []
    this.crs1 = (crs1) ? crs1 : Crs.Geographic
    this.crs2 = crs2 ? crs2 : Crs.Simple

    if (this.ctrlPts1.length !== this.ctrlPts2.length) {
      throw new Error(
        `PointGeoreferencer: ctrlPts1 and ctrlPts2 must have the same length ` +
        `(got ${this.ctrlPts1.length} vs ${this.ctrlPts2.length})`
      )
    }

    const p = params || {};
    // Ensure the 'forward' and 'inverse' keys exist.
    if (!p.forward) p.forward = {};
    if (!p.inverse) p.inverse = {};

    // Ensure the 'poly' object exists within both.
    if (!p.forward.poly) p.forward.poly = {};
    if (!p.inverse.poly) p.inverse.poly = {};

    // **THE MISSING PIECE:** Ensure 'tps' is initialized to null if not present.
    if (p.forward.tps === undefined) p.forward.tps = null;
    if (p.inverse.tps === undefined) p.inverse.tps = null;

    // Lazy-init flags — TIN data is computed on first use (see _computeForwardTIN etc.)
    p.forward.tin = false;
    p.inverse.tin = false;
    p.forward.triangles = false;
    p.inverse.triangles = false;

    // Set the now-guaranteed-to-be-safe params object.
    this.params = p;

    // TIN data fields (populated lazily by _computeForwardTIN / _computeInverseTIN)
    this.georefTIN1 = null;
    this.georefTIN1Vertices = null;
    this.georefTIN1Triangles = null;
    this.georefTIN1Centroids = null;
    this.tin1AffineParams = null;

    this.georefTIN2 = null;
    this.georefTIN2Vertices = null;
    this.georefTIN2Triangles = null;
    this.georefTIN2Centroids = null;
    this.tin2AffineParams = null;

    // Triangle-contains data fields (populated lazily, only when tinOnly !== true)
    this.georefTriangles1 = null;
    this.georefTriangles1Centroids = null;
    this.triangles1AffineParams = null;

    this.georefTriangles2 = null;
    this.georefTriangles2Centroids = null;
    this.triangles2AffineParams = null;
  }

  /**
   * Force computation of all TIN and triangle data that would otherwise be
   * computed lazily on the first call to each transform method.
   *
   * Calling this right after construction restores the original eager behaviour
   * and is recommended for realtime usage where the very first transform call
   * must be fast.
   *
   * @returns {PointGeoreferencer} this (for chaining)
   */
  precompute () {
    this._computeForwardTIN();
    this._computeInverseTIN();
    if (this.params.tinOnly === false) {
      this._computeForwardTriangles();
      this._computeInverseTriangles();
    }
    return this;
  }

  /** @private — compute and cache forward TIN (CRS1 → CRS2) data */
  _computeForwardTIN () {
    if (this.params.forward.tin) return;
    this.georefTIN1 = GeometryLib.generateTIN(this.ctrlPts1);
    this.georefTIN1Vertices = GeometryLib.pointsInTIN(this.georefTIN1);
    this.georefTIN1Triangles = GeometryLib.trianglesInTIN(this.georefTIN1);
    this.georefTIN1Centroids = GeometryLib.centroidsOfTriangles(this.georefTIN1Triangles, this.georefTIN1Vertices);
    this.tin1AffineParams = GeometryLib.affineParamsOfTIN(this.georefTIN1, this.ctrlPts2);
    this.params.forward.tin = true;
  }

  /** @private — compute and cache inverse TIN (CRS2 → CRS1) data */
  _computeInverseTIN () {
    if (this.params.inverse.tin) return;
    this.georefTIN2 = GeometryLib.generateTIN(this.ctrlPts2);
    this.georefTIN2Vertices = GeometryLib.pointsInTIN(this.georefTIN2);
    this.georefTIN2Triangles = GeometryLib.trianglesInTIN(this.georefTIN2);
    this.georefTIN2Centroids = GeometryLib.centroidsOfTriangles(this.georefTIN2Triangles, this.georefTIN2Vertices);
    this.tin2AffineParams = GeometryLib.affineParamsOfTIN(this.georefTIN2, this.ctrlPts1);
    this.params.inverse.tin = true;
  }

  /** @private — compute and cache forward triangle-contains (CRS1 → CRS2) data */
  _computeForwardTriangles () {
    if (this.params.forward.triangles) return;
    this.georefTriangles1 = GeometryLib.generateTrianglesFromGeorefPoints(this.ctrlPts1, this.ctrlPts2);
    this.georefTriangles1Centroids = GeometryLib.centroidsOfTriangles(this.georefTriangles1, this.ctrlPts1);
    this.triangles1AffineParams = GeometryLib.affineParamsOfTriangles(this.georefTriangles1, this.ctrlPts1, this.ctrlPts2);
    this.params.forward.triangles = true;
  }

  /** @private — compute and cache inverse triangle-contains (CRS2 → CRS1) data */
  _computeInverseTriangles () {
    if (this.params.inverse.triangles) return;
    this.georefTriangles2 = GeometryLib.generateTrianglesFromGeorefPoints(this.ctrlPts2, this.ctrlPts1);
    this.georefTriangles2Centroids = GeometryLib.centroidsOfTriangles(this.georefTriangles2, this.ctrlPts2);
    this.triangles2AffineParams = GeometryLib.affineParamsOfTriangles(this.georefTriangles2, this.ctrlPts2, this.ctrlPts1);
    this.params.inverse.triangles = true;
  }


  // --- FORWARD TRANSFORMATION METHODS ---

  georefPolynomial (coords, order) {
    // Calculate coefficients on-demand if they don't exist
    if (this.params.forward.poly[order] === undefined) {
      this.params.forward.poly[order] = this._calculatePolynomialCoefficients(this.ctrlPts1, this.ctrlPts2, order);
    }

    const coeffs = this.params.forward.poly[order];
    if (!coeffs) {
      console.error(`Forward polynomial (order ${order}) coefficients could not be calculated.`);
      return null;
    }
    return this._applyPolynomial(coords, order, coeffs);
  }

  georefTPS (coords) {
    // Calculate coefficients on-demand if they don't exist
    if (this.params.forward.tps === null) {
      this.params.forward.tps = this._calculateTPSCoefficients(this.ctrlPts1, this.ctrlPts2);
    }

    const coeffs = this.params.forward.tps;
    if (!coeffs) {
      console.error("Forward TPS coefficients could not be calculated.");
      return null;
    }
    return this._applyTPS(coords, coeffs, this.ctrlPts1);
  }

  // --- INVERSE TRANSFORMATION METHODS ---

  georefInversePolynomial (coords, order) {
    // Calculate coefficients on-demand if they don't exist
    if (this.params.inverse.poly[order] === undefined) {
      this.params.inverse.poly[order] = this._calculatePolynomialCoefficients(this.ctrlPts2, this.ctrlPts1, order);
    }

    const coeffs = this.params.inverse.poly[order];
    if (!coeffs) {
      console.error(`Inverse polynomial (order ${order}) coefficients could not be calculated.`);
      return null;
    }
    return this._applyPolynomial(coords, order, coeffs);
  }

  georefInverseTPS (coords) {
    // Calculate coefficients on-demand if they don't exist
    if (this.params.inverse.tps === null) {
      this.params.inverse.tps = this._calculateTPSCoefficients(this.ctrlPts2, this.ctrlPts1);
    }

    const coeffs = this.params.inverse.tps;
    if (!coeffs) {
      console.error("Inverse TPS coefficients could not be calculated.");
      return null;
    }
    return this._applyTPS(coords, coeffs, this.ctrlPts2);
  }

  // --- PRIVATE CALCULATION & APPLY METHODS (No changes here) ---

  _calculatePolynomialCoefficients (sourcePoints, targetPoints, order) {
    const n = sourcePoints.length;
    const requiredPoints = { 1: 3, 2: 6, 3: 10 };

    if (n < requiredPoints[order]) {
      console.warn(`Not enough points for polynomial order ${order}. Need ${requiredPoints[order]}, have ${n}.`);
      return false; // Return false to distinguish from null/successful calculation
    }

    const A = [];
    const bx = targetPoints.map(p => p[0]);
    const by = targetPoints.map(p => p[1]);

    for (const [sx, sy] of sourcePoints) {
      if (order === 1) A.push([1, sx, sy]);
      else if (order === 2) A.push([1, sx, sy, sx * sy, sx * sx, sy * sy]);
      else if (order === 3) A.push([1, sx, sy, sx * sy, sx * sx, sy * sy, sx * sx * sy, sx * sy * sy, sx * sx * sx, sy * sy * sy]);
    }

    try {
      const AT = transpose(A);
      const ATA = multiply(AT, A);
      const ATbx = multiply(AT, bx);
      const ATby = multiply(AT, by);
      const lupATA = lup(ATA)
      return { x: lusolve(lupATA, ATbx).toArray().flat(), y: lusolve(lupATA, ATby).toArray().flat() };
    } catch (e) {
      console.error(`Failed to solve for polynomial (order ${order}) coefficients:`, e.message);
      return false;
    }
  }

  _calculateTPSCoefficients (sourcePoints, targetPoints) {
    const n = sourcePoints.length;
    if (n < 3) return false;

    const P = sourcePoints.map(([sx, sy]) => [1, sx, sy]);
    const K = this._makeTPSKernelMatrix(sourcePoints);

    const M_top = K.map((row, i) => [...row, ...P[i]]);
    const M_bottom = transpose(P).map(row => [...row, 0, 0, 0]);
    const M = [...M_top, ...M_bottom];

    const yx = [...targetPoints.map(p => p[0]), 0, 0, 0];
    const yy = [...targetPoints.map(p => p[1]), 0, 0, 0];

    try {
      const lupM = lup(M)
      return { x: lusolve(lupM, yx).toArray().flat(), y: lusolve(lupM, yy).toArray().flat() };
    } catch (e) {
      console.error("Failed to solve for TPS coefficients:", e.message);
      return false;
    }
  }

  _makeTPSKernelMatrix (points) {
    const n = points.length;
    const K = Array(n).fill(0).map(() => Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i; j < n; j++) {
        if (i === j) continue;
        const dx = points[i][0] - points[j][0], dy = points[i][1] - points[j][1];
        const r_sq = dx * dx + dy * dy;
        const val = r_sq > 0 ? r_sq * Math.log(r_sq) : 0;
        K[i][j] = K[j][i] = val;
      }
    }
    return K;
  }

  _applyPolynomial (coords, order, coeffs) {
    const [x, y] = coords;
    let vec;
    if (order === 1) vec = [1, x, y];
    else if (order === 2) vec = [1, x, y, x * y, x * x, y * y];
    else if (order === 3) vec = [1, x, y, x * y, x * x, y * y, x * x * y, x * y * y, x * x * x, y * y * y];
    else return null;

    return [multiply(transpose(coeffs.x), vec), multiply(transpose(coeffs.y), vec)];
  }

  _applyTPS (coords, coeffs, refPoints) {
    const [x, y] = coords;
    const n = refPoints.length;

    const weightsX = coeffs.x.slice(0, n), affineX = coeffs.x.slice(n);
    const weightsY = coeffs.y.slice(0, n), affineY = coeffs.y.slice(n);

    let sumX = affineX[0] + affineX[1] * x + affineX[2] * y;
    let sumY = affineY[0] + affineY[1] * x + affineY[2] * y;

    for (let i = 0; i < n; i++) {
      const dx = x - refPoints[i][0], dy = y - refPoints[i][1];
      const r_sq = dx * dx + dy * dy;
      if (r_sq > 0) {
        const kernelVal = r_sq * Math.log(r_sq);
        sumX += weightsX[i] * kernelVal;
        sumY += weightsY[i] * kernelVal;
      }
    }
    return [sumX, sumY];
  }

  /**
   * @summary geo-reference the point or points from coordinate sytem 1 to coordinate sytem 2 with affine transform based on nearest triangle that contains the point if possible
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @param {object|null} [extra=null] extra parameters
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefAffineWithTriangleContains (pt, extra = null) {
    if (this.params.tinOnly === true) {
      return null
    }
    this._computeForwardTriangles()
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      if (extra !== null) {
        extra.inside = []
        pt.forEach(p => {
          let e = {}
          const coord = this.georefAffineWithTriangleContains(p, e)
          extra.inside.push(e.inside)
          res.push(coord)
        })
      } else {
        pt.forEach(p => {
          res.push(this.georefAffineWithTriangleContains(p))
        })
      }
      return res
    }
    const [triIdx, inside] = GeometryLib.georefTriangleForPoint(this.georefTriangles1, this.ctrlPts1, this.georefTriangles1Centroids, pt, this.crs1)
    const params = this.triangles1AffineParams[triIdx]
    if (extra !== null) {
      extra.inside = inside
    }
    return GeometryLib.affineTransformPoint(pt, params)
  }

  /**
   * @summary geo-reference the point or points from coordinate sytem 2 to coordinate system 1 with affine transform based on nearest triangle that contains the point if possible
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @param {object|null} [extra=null] extra parameters
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefInverseAffineWithTriangleContains (pt, extra = null) {
    if (this.params.tinOnly === true) {
      return null
    }
    this._computeInverseTriangles()
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      if (extra !== null) {
        extra.inside = []
        pt.forEach(p => {
          let e = {}
          const coord = this.georefInverseAffineWithTriangleContains(p, e)
          extra.inside.push(e.inside)
          res.push(coord)
        })
      } else {
        pt.forEach(p => {
          res.push(this.georefInverseAffineWithTriangleContains(p))
        })
      }
      return res
    }
    const [triIdx, inside] = GeometryLib.georefTriangleForPoint(this.georefTriangles2, this.ctrlPts2, this.georefTriangles2Centroids, pt, this.crs2)
    const params = this.triangles2AffineParams[triIdx]
    if (extra !== null) {
      extra.inside = inside
    }
    return GeometryLib.affineTransformPoint(pt, params)
  }

  /**
   * @summary geo-reference the geographic point or points from coordinate system 1 to coordinate system 2 with affine transform based on TIN
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @param {boolean} handle_exception if true, use the nearest triangle (not the ones in TIN) if no TIN triangle is available
   * @param {object|null} [extra=null] extra parameters
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefAffineWithTIN (pt, handle_exception = true, extra = null) {
    this._computeForwardTIN()
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      if (extra !== null) {
        extra.inside = []
        pt.forEach(p => {
          let e = {}
          const coord = this.georefAffineWithTIN(p, handle_exception, e)
          extra.inside.push(e.inside)
          res.push(coord)
        })
      } else {
        pt.forEach(p => {
          res.push(this.georefAffineWithTIN(p, handle_exception))
        })
      }
      return res
    }
    let [triIdx, inside] = GeometryLib.georefTriangleForPoint(this.georefTIN1Triangles, this.georefTIN1Vertices, this.georefTIN1Centroids, pt, this.crs1)
    const params = this.tin1AffineParams[triIdx]
    if (params === undefined || params === null) {
      // exception: irregular triangle almost in the same line
      // fall down to the affine with triangle contains the point
      if (handle_exception) {
        return this.georefAffineWithTriangleContains(pt, extra)
      } else {
        if (extra !== null) {
          extra.inside = false
        }
        return null
      }
    } else {
      if (extra !== null) {
        extra.inside = inside
      }
      return GeometryLib.affineTransformPoint(pt, params)
    }
  }

  /**
   * @summary geo-reference the geographic point or points from coordinate system 2 to coordinate system 1 with affine transform based on TIN
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @param {boolean} handle_exception if true, use the nearest triangle (not the ones in TIN) if no TIN triangle is available
   * @param {object|null} [extra=null] extra parameters
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefInverseAffineWithTIN (pt, handle_exception = true, extra = null) {
    this._computeInverseTIN()
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      if (extra !== null) {
        extra.inside = []
        pt.forEach(p => {
          let e = {}
          const coord = this.georefInverseAffineWithTIN(p, handle_exception, e)
          extra.inside.push(e.inside)
          res.push(coord)
        })
      } else {
        pt.forEach(p => {
          res.push(this.georefInverseAffineWithTIN(p, handle_exception))
        })
      }
      return res
    }
    let [triIdx, inside] = GeometryLib.georefTriangleForPoint(this.georefTIN2Triangles, this.georefTIN2Vertices, this.georefTIN2Centroids, pt, this.crs2)
    const params = this.tin2AffineParams[triIdx]
    if (params === undefined || params === null) {
      // exception: irregular triangle almost in the same line
      // fall down to the affine with triangle contains the point
      if (handle_exception) {
        return this.georefInverseAffineWithTriangleContains(pt, extra)
      } else {
        if (extra !== null) {
          extra.inside = false
        }
        return null
      }
    } else {
      if (extra !== null) {
        extra.inside = inside
      }
      return GeometryLib.affineTransformPoint(pt, params)
    }
  }
}
