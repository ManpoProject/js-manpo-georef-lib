import GeographicLib from 'geographiclib'
import Delaunator from 'delaunator'
import lodash from 'lodash'
import * as mathjs from 'mathjs'
import { Enumify } from 'enumify'

const geodesic = GeographicLib.Geodesic.WGS84

export class Crs extends Enumify {
  static Geographic = new Crs()
  static Simple = new Crs()
}

export class GeometryLib {

  static R = 6371000 // radius of the earth

  /**
   * @summary Calculate the distance of two geographic points
   * @param {number[]} p1 1st point, [lon1, lat1]
   * @param {number[]} p2 2nd point, [lon2, lat2]
   * @returns {number} distance in meters
   */
  static geoDistance(p1, p2) {
    const r = geodesic.Inverse(p1[1], p1[0], p2[1], p2[0])
    return r.s12
  }

  /**
   * @summary Calculate the distance of two 2D points
   * @param {number[]} p1 1st point, [x1, y1]
   * @param {number[]} p2 2nd point, [x2, y2]
   * @returns {number} distance
   */
  static simpleDistance(p1, p2) {
    return Math.hypot(p1[0] - p2[0], p1[1] - p2[1])
  }

  /**
   * @summary Calculate the distance of two 2D points
   * @param {number[]} p1 1st point, [x1, y1]
   * @param {number[]} p2 2nd point, [x2, y2]
   * @param {Crs} crs the coordinate system of the points
   * @returns {number} distance
   */
  static distance(p1, p2, crs) {
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
  static triangleCentroid(points) {
    const x = (points[0][0] + points[1][0] + points[2][0]) / 3
    const y = (points[0][1] + points[1][1] + points[2][1]) / 3
    return [x, y]
  }

  static centroidsOfTriangles(triangles, pts) {
    let res = []
    triangles.forEach(tri => {
      res.push(this.triangleCentroid(this.trianglePoints(tri, pts)))
    })
    return res
  }

  /**
   * @summary Calculate the distances from the point (p) to each of the points in (pts), then sort them in ascending order
   * @param {number[]} p the point [x, y]
   * @param {number[][]} pts the points [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {number[][]} array of the sorted distances with the index of the corresponded point, [[idx1, dist1], [idx2, dist2], ...]
   */
  static sortDistance(p, pts, crs) {
    let distArr = []
    if (crs === Crs.Geographic) {
      pts.forEach((pt, idx) => {
        distArr.push([idx, this.geoDistance(p, pt)])
      })
    } else {
      pts.forEach((pt, idx) => {
        distArr.push([idx, this.simpleDistance(p, pt)])
      })
    }
    distArr.sort((a, b) => {
      return a[1] - b[1]
    })
    return distArr
  }

  /**
   * @summary Find the nearest point in (pts) to the point (p)
   * @param {number[]} p the point like [lon, lat] or [x, y]
   * @param {number[][]} pts the points like [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {Array} the nearest point [nearestPointIndex, [nearest_lon, nearest_lat]]
   */
  static nearestPoint(p, pts, crs) {
    if (pts === undefined || pts === null) {
      return [-1, null]
    }
    if (pts.length === 1) {
      return [0, pts[0]]
    }
    const distArr = this.sortDistance(p, pts, crs)
    return [distArr[0][0], pts[distArr[0][0]]]
  }

  /**
   * @summary Find the nearest two points in (pts) to the point (p)
   * @param {number[]} p the point like [lon, lat] or [x, y]
   * @param {number[][]} pts the points like [[lon1, lat1], [lon2, lat2], ...] or [[x1, y1], [x2, y2], ...]
   * @param {Crs} crs the coordinate system of the points
   * @returns {Array} the nearest two point [nearestIndex, 2nd_nearestIndex, [nearest_lon, nearest_lat], [2nd_nearest_lon, 2nd_nearest_lat]]
   */
  static nearestTwoPoints(p, pts, crs) {
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
  static nearestThreePoints(p, pts, crs) {
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
  static farthestTwoPoints(pts, crs) {
    const count = pts.length
    let max_dist = -1, idx1 = -1, idx2 = -1
    for (let i = 0; i < count - 1; i++) {
      for (let j = i + 1; j < count; j++) {
        const dist = (crs === Crs.Geographic)? this.geoDistance(pts[i], pts[j]) : this.simpleDistance(pts[i], pts[j])
        if (dist > max_dist) {
          max_dist = dist
          idx1 = i
          idx2 = j
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
  static generateTIN(pts) {
    return new Delaunator(this.pointsToCoords(pts))
  }

  /**
   * @summary get the vertices of a triangle in the TIN
   * @param {number[]} tri the triangle, defined as point indices of the vertices [pt_idx0, pt_idx1, pt_idx2]
   * @param {Delaunator} tin the TIN, which is a Delaunator instance
   * @returns {number[][]} points of the triangle [[x0, y0], [x1, y1], [x2, y2]]
   */
  static trianglePointsInTIN(tri, tin) {
    let res = []
    tri.forEach(p => {
      res.push(this.pointInCoordsByIndex(p, tin.coords))
    })
    return res
  }

  /**
   * @summary convert the array of coordinates [x1, y1, x2, y2, ...] to array of points [[x1, y1], [x2, y2], ...]
   * @param {number[]} coords [x1, y1, x2, y2, ...]
   * @returns {number[][]} [[x1, y1], [x2, y2], ...]
   */
  static coordsToPoints(coords) {
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
  static pointsInTIN(tin) {
    return this.coordsToPoints(tin.coords)
  }

  /**
   * @summary get the triangles in a TIN which have certain vertex defined by point index
   * @param {number} idx point index of the vertex
   * @param {Delaunator} tin the TIN, which is a Delaunator instance
   * @returns {number[][]} triangles that contain the vertex, in the form of [[pt_idx0, pt_idx1, pt_idx2], ...]
   */
  static trianglesIncludeVertexIndexInTIN(idx, tin) {
    const tri = this.trianglesInTIN(tin)
    return this.trianglesIncludeVertexIndex(idx, tri)
  }

  /**
   * @summary get the triangles which have certain vertex defined by point index
   * @param {number} idx point index of the vertex
   * @param {number[][]} triangles point indices of the vertices of the triangles [[pt_idx0, pt_idx1, pt_idx2], ...]
   * @returns {number[][]} triangles that contain the vertex, in the form of [[pt_idx0, pt_idx1, pt_idx2], ...]
   */
  static trianglesIncludeVertexIndex(idx, triangles) {
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
  static nearestTriangleInTIN(p, tin, crs) {
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
  static nearestTriangleIndex(p, triangles, vertices, crs) {
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
  static geoDistancePointToSegmentArc(p, p1, p2) {
    const inv12 = geodesic.Inverse(p1[1], p1[0], p2[1], p2[0])
    const bear12 = inv12.azi1
    const inv13 = geodesic.Inverse(p1[1], p1[0], p[1], p[0])
    const bear13 = inv13.azi1
    const dis13 = inv13.s12
    let diff = Math.abs(bear13 - bear12)
    if (diff > Math.PI) {
      diff = 2 * Math.PI - diff
    }
    if (diff > (Math.PI / 2)) {
      return [dis13, p1]
    } else {
      const dxt = Math.asin(Math.sin(dis13 / R) * Math.sin(degsToRads(bear13 - bear12))) * R
      const dis12 = inv12.s12
      const dis14 = Math.acos(Math.cos(dis13 / R) / Math.cos(dxt / R)) * R
      if (dis14 > dis12) {
        const dis23 = geodesic.Inverse(p2[1], p2[0], p[1], p[0]).s12
        return [dis23, p2]
      } else {
        const direct12 = geodesic.Direct(lat1, lon1, bear12, dis14)
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
    static simpleDistancePointToSegment(p, p1, p2) {
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
  static nearestPointOnSegment(p, p1, p2) {
    const px = p2[0] - p1[0]
    const py = p2[1] - p1[1]
    const som = px * px + py * py
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
  static distancePointToLinestring(p, l, crs) {
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
  static segmentLengthsOfGeoLinestring(l) {
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
  static segmentLengthsOfSimpleLinestring(l) {
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
  static linearRefPointOnLinestring(p, polyline1, polyline2, crs1, crs2, bf) {
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
  static propOfPointOnLinestring(p, l, segIdx, crs) {
    const segLens = (crs === Crs.Geographic)? this.segmentLengthsOfGeoLinestring(l): this.segmentLengthsOfSimpleLinestring(l)
    const refLen = lodash.sum(segLens.slice(0, segIdx)) + this.distance(l[segIdx], p, crs)
    return refLen / lodash.sum(segLens)
  }

  /**
   * @summary Find the point on the polyline of a certain length proportion in 2D coordinates
   * @param {number} prop the proportion in the range [0, 1]
   * @param {number[][]} l the polyline [[x1, y1], [x2, y2], ...]
   * @returns {number[]} the point [x, y]
   */
  static pointOfPropOnSimpleLinestring(prop, l) {
    if (prop <= 0) {
      return l[0]
    }
    if (prop >= 1) {
      return l[l.length - 1]
    }
    const segLens = this.segmentLengthsOfSimpleLinestring(l)
    const sumLen = lodash.sum(segLens)
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
  static pointOfPropOnGeoLinestring(prop, l) {
    if (prop <= 0) {
      return l[0]
    }
    if (prop >= 1) {
      return l[l.length - 1]
    }
    const segLens = this.segmentLengthsOfGeoLinestring(l)
    const sumLen = lodash.sum(segLens)
    const refLen = sumLen * prop
    let currentLen = 0
    for (let i = 0; i < segLens.length; i++) {
      currentLen += segLens[i]
      if (currentLen > refLen) {
        const d = currentLen - refLen
        const r = d / segLens[i]
        const inv =  geodesic.Inverse(l[i][1], l[i][0], l[i + 1][1], l[i + 1][0])
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
  static pointOfPropOnLinestring(prop, l, crs) {
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
  static affineParamsOfTIN(tin, pts) {
    const triangles = this.trianglesInTIN(tin)
    let res = []
    triangles.forEach(tri => {
      res.push(this.affineParamsOfTriangle(this.trianglePointsInTIN(tri, tin), this.trianglePoints(tri, pts)))
    })
    return res
  }

  /**
   * @summary convert the array of points [[x1, y1], [x2, y2], ...] to array of coordinates [x1, y1, x2, y2, ...]
   * @param {number[][]} pts [[x1, y1], [x2, y2], ...]
   * @returns {number[]} [x1, y1, x2, y2, ...]
   */
  static pointsToCoords(pts) {
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
  static trianglesInTIN(tin) {
    const t = tin.triangles
    const len = tin.trianglesLen
    let res = []
    for (let i = 0; i < len - 2; i += 3) {
      res.push([t[i], t[i + 1], t[i + 2]])
    }
    return res
  }

  /**
   * @summary get the vertices of a triangle
   * @param {number[]} tri the triangle, defined as point indices of the vertices [pt_idx0, pt_idx1, pt_idx2]
   * @param {number[][]} pts the points [[x, y], ...]
   * @returns {number[][]} points of the triangle [[x0, y0], [x1, y1], [x2, y2]]
   */
  static trianglePoints(tri, pts) {
    return [pts[tri[0]], pts[tri[1]], pts[tri[2]]]
  }

  /**
   * @summary get a point [x, y] by index in the array of coordinates [x0, y0, x1, y1, ...]
   * @param {number} idx start from 0
   * @param {number[]} coords coordinates [x0, y0, x1, y1, ...]
   * @returns {number[]} idx = i => [xi, yi]
   */
  static pointInCoordsByIndex(idx, coords) {
    return [coords[idx * 2], coords[idx * 2 + 1]]
  }

  /**
   * @summary Calculate the affine transformed coordinates of the point with the params
   * @param {number[]} p the point to transform [lon, lat], or [x, y]
   * @param {mathjs.Matrix} t the matrix of params for affine transform
   * @returns {number[]} transformed point [u, v]
   */
  static affineTransformPoint(p, t) {
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
  static affineTransformInversePoint(p, t) {
    const t_inv = mathjs.inv(t)
    return this.affineTransformPoint(p, t_inv)
  }

  /**
   * @summary Calculate the corresponded point to a segment with similarity transform from a point and a segment in another coordinate system
   * @param {number[]} p the point, like [lon, lat]
   * @param {number[][]} seg1 the segment, like [[lon1, lat1], [lon2, lat2]]
   * @param {number[][]} seg2 the segment, like [[x1, y1], [x2, y2]]
   * @returns {number[]} transformed point [x, y]
   */
  static getSimilarPoint(p, seg1, seg2) {
    const v1 = mathjs.subtract(seg1[1], seg1[0])
    const v2 = mathjs.subtract(p, seg1[0])
    const norm1 = mathjs.norm(v1), norm2 = mathjs.norm(v2)
    if (mathjs.abs(norm1) < 1e-10) {
      throw new Error('The two geo-ref points are the same')
    }
    if (mathjs.abs(norm2) < 1e-10) {
      return seg2[0]
    }
    const dot = mathjs.dot(v1, v2), cross = mathjs.cross(v1, v2)
    const cos = dot / norm1 / norm2, sin = cross / norm1 / norm2
    return rotateSegmentWithMatrix(seg2,  [[cos, -sin], [sin, cos]])
  }

  /**
   * @summary Generate triangles for affine transform from corresponded geo points and 2D points
   * @param {number[][]} ctrlPts1 [[lon1, lat1], [lon2, lat2], ...]
   * @param {number[][]} ctrlPts2 [[x1, y1], [x2, y2], ...]
   * @returns {number[][]} point indices of each triangle [[triIdx1-1, triIdx1-2, triIdx1-3], [...], ...]
   */
  static generateTrianglesFromGeorefPoints(ctrlPts1, ctrlPts2) {
    let res = []
    const count = ctrlPts1.length
    for (let a = 0; a < count -2; a++) {
      for (let b = a + 1; b < count -1; b++) {
        for (let c = b + 1; c < count; c++) {
          const x0 = ctrlPts1[a][0], y0 = ctrlPts1[a][1],
            x1 = ctrlPts1[b][0], y1 = ctrlPts1[b][1],
            x2 = ctrlPts1[c][0], y2 = ctrlPts1[c][1],
            u0 = ctrlPts2[a][0], v0 = ctrlPts2[a][1],
            u1 = ctrlPts2[b][0], v1 = ctrlPts2[b][1],
            u2 = ctrlPts2[c][0], v2 = ctrlPts2[c][1]
          // check if on the same line
          if (Math.abs((y1 - y0) * (x2 - x0) - (y2 - y0) * (x1 - x0)) < 1e-10) {
            continue
          }
          if (Math.abs((v1 - v0) * (u2 - u0) - (v2 - v0) * (u1 - u0)) < 1e-10) {
            continue
          }
          // check if there is any point inside the triangle
          let inside = false
          for (let i = 0; i < count; i++) {
            if (i === a || i === b || i === c) {
              continue
            }
            if (this.isTriangleContainsPoint(ctrlPts1[a], ctrlPts1[b], ctrlPts1[c], ctrlPts1[i])) {
              inside = true
              break
            }
          }
          if (inside) {
            continue
          }
          res.push([a, b, c])
        }
      }
    }
    return res
  }

  /**
   * @summary Get the proper triangle (indices of the three vertices) for affine transform the point p
   * @param {number[][]} triangles indices of vertices of each triangle
   * @param {number[][]} points coordinates of control points
   * @param {number[][]} centroids centroids of triangles
   * @param {number[]} p the point to be transformed
   * @param {Crs} crs the coordinate system of the points
   * @returns {number} the index of the triangle to be used for transformation
   */
  static georefTriangleForPoint(triangles, points, centroids, p, crs) {
    let distArr = []
    if (crs === Crs.Geographic) {
      centroids.forEach((centroid, i) => {
        distArr.push([i, this.geoDistance(p, centroid)])
      })
    } else {
      centroids.forEach((centroid, i) => {
        distArr.push([i, this.simpleDistance(p, centroid)])
      })
    }
    const count = distArr.length
    for (let i = 0; i < count; i++) {
      const tri = triangles[i]
      if (this.isTriangleContainsPoint(points[tri[0]], points[tri[1]], points[tri[2]], p)) {
        return i
      }
    }
    return distArr[0][0]
  }

  /**
   * @summary Find a triangle that contains the point in a list of triangles
   * @param {number[][]} triangles indices of vertices of each triangle
   * @param {number[][]} vertices coordinates of vertices
   * @param {number[]} p the point
   * @returns {number|null} the index of the triangle, or null if no such triangle
   */
  static triangleIndexContainsPoint(triangles, vertices, p) {
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
  static affineParamsOfTriangle(tri1, tri2) {
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
  static affineParamsOfTriangles(triangles, ctrlPts1, ctrlPts2) {
    let res = []
    triangles.forEach(tri => {
      const tri1 = [ctrlPts1[tri[0]], ctrlPts1[tri[1]], ctrlPts1[tri[2]]]
      const tri2 = [ctrlPts2[tri[0]], ctrlPts2[tri[1]], ctrlPts2[tri[2]]]
      res.push(this.affineParamsOfTriangle(tri1, tri2))
    })
    return res
  }

  /**
   * @summary Check if the point p is inside the triangle abc
   * @param {number[]} a vertex of the triangle [x1, y1]
   * @param {number[]} b vertex of the triangle [x2, y2]
   * @param {number[]} c vertex of the triangle [x3, y3]
   * @param {number[]} p the point p [x, y]
   * @returns {boolean} true if p is inside abc, false if not
   */
  static isTriangleContainsPoint(a, b, c, p) {
    const AP = mathjs.subtract(p, a).concat([0])
    const AB = mathjs.subtract(b, a).concat([0])
    const BP = mathjs.subtract(p, b).concat([0])
    const BC = mathjs.subtract(c, b).concat([0])
    const CP = mathjs.subtract(p, c).concat([0])
    const CA = mathjs.subtract(a, c).concat([0])
    const APxAB = mathjs.cross(AP, AB)[2]
    const BPxBC = mathjs.cross(BP, BC)[2]
    const CPxCA = mathjs.cross(CP, CA)[2]
    // on border
    if (Math.abs(APxAB) < 1e-10) {
      if ((BPxBC > 0 && CPxCA > 0) || (BPxBC < 0 && CPxCA < 0)) {
        return true
      }
    }
    if (Math.abs(BPxBC) < 1e-10) {
      if ((APxAB > 0 && CPxCA > 0) || (APxAB < 0 && CPxCA < 0)) {
        return true
      }
    }
    if (Math.abs(CPxCA) < 1e-10) {
      if ((BPxBC > 0 && APxAB > 0) || (BPxBC < 0 && APxAB < 0)) {
        return true
      }
    }
  
    // inside
    if ((APxAB > 0 && BPxBC > 0 && CPxCA > 0) || (APxAB < 0 && BPxBC < 0 && CPxCA < 0)) {
      return true
    }
    // outside
    return false
  }
}

export class PointGeoreferencer {
  /**
   * @param {number[][]} ctrlPts1 coordinates of control points in CRS1
   * @param {number[][]} ctrlPts2 coordinates of control points in CRS2
   * @param {Crs} crs1 buffer range in meters of georef lines
   * @param {Crs} crs2 default buffer range if not specified
   * @returns {PointGeoreferencer}
   */
  constructor(ctrlPts1=[], ctrlPts2=[], crs1=Crs.Geographic, crs2=Crs.Simple, params=null) {
    this.ctrlPts1 = (ctrlPts1) ? ctrlPts1 : []
    this.ctrlPts2 = (ctrlPts2) ? ctrlPts2 : []
    this.crs1 = (crs1) ? crs1 : Crs.Geographic
    this.crs2 = crs2 ? crs2 : Crs.Simple
    this.params = params

    this.georefTIN1 = GeometryLib.generateTIN(this.ctrlPts1)
    this.georefTIN1Vetices = GeometryLib.pointsInTIN(this.georefTIN1)
    this.georefTIN1Triangles = GeometryLib.trianglesInTIN(this.georefTIN1)
    this.georefTIN1Centroids = GeometryLib.centroidsOfTriangles(this.georefTIN1Triangles, this.georefTIN1Vetices)
    this.tin1AffineParams = GeometryLib.affineParamsOfTIN(this.georefTIN1, this.ctrlPts2)
    this.georefTriangles1 = GeometryLib.generateTrianglesFromGeorefPoints(this.ctrlPts1, this.ctrlPts2)
    this.georefTriangles1Centroids = GeometryLib.centroidsOfTriangles(this.georefTriangles1, this.ctrlPts1)
    this.triangles1AffineParams = GeometryLib.affineParamsOfTriangles(this.georefTriangles1, this.ctrlPts1, this.ctrlPts2)
  
    this.georefTIN2 = GeometryLib.generateTIN(this.ctrlPts2)
    this.georefTIN2Vetices = GeometryLib.pointsInTIN(this.georefTIN2)
    this.georefTIN2Triangles = GeometryLib.trianglesInTIN(this.georefTIN2)
    this.georefTIN2Centroids = GeometryLib.centroidsOfTriangles(this.georefTIN2Triangles, this.georefTIN2Vetices)
    this.tin2AffineParams = GeometryLib.affineParamsOfTIN(this.georefTIN2, this.ctrlPts1)
    this.georefTriangles2 = GeometryLib.generateTrianglesFromGeorefPoints(this.ctrlPts2, this.ctrlPts1)
    this.georefTriangles2Centroids = GeometryLib.centroidsOfTriangles(this.georefTriangles2, this.ctrlPts2)
    this.triangles2AffineParams = GeometryLib.affineParamsOfTriangles(this.georefTriangles2, this.ctrlPts2, this.ctrlPts1)
  
  }

  /**
   * @summary geo-reference the point or points from coordinate sytem 1 to coordinate sytem 2 with affine transform based on nearest triangle that contains the point if possible
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefAffineWithTriangleContains(pt) {
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      pt.forEach(p => {
        res.push(this.georefAffineWithTriangleContains(p))
      })
      return res
    }
    const triIdx = GeometryLib.georefTriangleForPoint(this.georefTriangles1, this.ctrlPts1, pt, this.crs1)
    const params = this.triangles1AffineParams[triIdx]
    return GeometryLib.affineTransformPoint(pt, params)
  }

  /**
   * @summary geo-reference the point or points from coordinate sytem 2 to coordinate system 1 with affine transform based on nearest triangle that contains the point if possible
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefInverseAffineWithTriangleContains(pt) {
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      pt.forEach(p => {
        res.push(this.georefInverseAffineWithTriangleContains(p))
      })
      return res
    }
    const triIdx = GeometryLib.georefTriangleForPoint(this.georefTriangles2, this.ctrlPts2, pt, this.crs2)
    const params = this.triangles2AffineParams[triIdx]
    return GeometryLib.affineTransformPoint(pt, params)
  }

  /**
   * @summary geo-reference the geographic point or points from coordinate system 1 to coordinate system 2 with affine transform based on TIN
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @param {boolean} handle_exception if true, use the nearest triangle (not the ones in TIN) if no TIN triangle is available
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefAffineWithTIN(pt, handle_exception=true) {
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      pt.forEach(p => {
        res.push(this.georefAffineWithTIN(p, handle_exception))
      })
      return res
    }
    let triIdx = GeometryLib.triangleIndexContainsPoint(this.georefTIN1Triangles, this.georefTIN1Vetices, pt)
    if (triIdx === null) triIdx = GeometryLib.nearestTriangleIndex(pt, this.georefTIN1Triangles, this.georefTIN1Vetices)
    if (triIdx === null) {
      if (handle_exception) {
        return this.georefAffineWithTriangleContains(pt)
      } else {
        return null
      }
    }
    const params = this.tin1AffineParams[triIdx]
    if (params) {
      return GeometryLib.affineTransformPoint(pt, params)
    } else {
      // exception: irregular triangle almost in the same line
      // fall down to the affine with triangle contains the point
      if (handle_exception) {
        return this.georefAffineWithTriangleContains(pt)
      } else {
        return null
      }
    }
  }

  /**
   * @summary geo-reference the geographic point or points from coordinate system 2 to coordinate system 1 with affine transform based on TIN
   * @param {number[][]|number[]} pt the coordinates to be transformed, e.g., [[lon, lat], ...] or [lon, lat]
   * @param {boolean} handle_exception if true, use the nearest triangle (not the ones in TIN) if no TIN triangle is available
   * @returns {number[][]|number[]} the transformed coordinates, e.g., [[x, y], ...] or [x, y]
   */
  georefInverseAffineWithTIN(pt, handle_exception=true) {
    if (pt === undefined || pt === null) {
      return null
    }
    if (Array.isArray(pt[0])) {
      let res = []
      pt.forEach(p => {
        res.push(this.georefInverseAffineWithTIN(p, handle_exception))
      })
      return res
    }
    let triIdx = GeometryLib.triangleIndexContainsPoint(this.georefTIN2Triangles, this.georefTIN2Vetices, pt)
    if (triIdx === null) triIdx = GeometryLib.nearestTriangleIndex(pt, this.georefTIN2Triangles, this.georefTIN2Vetices)
    if (triIdx === null) {
      if (handle_exception) {
        return this.georefInverseAffineWithTriangleContains(pt)
      } else {
        return null
      }
    }
    const params = this.tin2AffineParams[triIdx]
    if (params) {
      return GeometryLib.affineTransformPoint(pt, params)
    } else {
      // exception: irregular triangle almost in the same line
      // fall down to the affine with triangle contains the point
      if (handle_exception) {
        return this.georefInverseAffineWithTriangleContains(pt)
      } else {
        return null
      }
    }
  }
}

/**
 * @summary convert radians to degrees
 * @param {number} rad radians
 * @returns {number} degrees
 */
const radsToDegs = rad => rad * 180 / Math.PI

/**
 * @summary convert degrees to radians
 * @param {number} deg degrees
 * @returns {number} radians
 */
const degsToRads = deg => (deg * Math.PI) / 180.0