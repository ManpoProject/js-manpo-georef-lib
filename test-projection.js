import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ProjectionLib } from './index.js'

test('ProjectionLib UTM transformations', async (t) => {
  await t.test('Tokyo (Zone 54S)', () => {
    // Tokyo coordinates
    const lon = 139.6917
    const lat = 35.6895

    // Convert to UTM
    const utm = ProjectionLib.wgs84ToUTM(lon, lat)

    // Check zone
    assert.strictEqual(utm.zone, 54)
    assert.strictEqual(utm.isNorthernHemisphere, true)

    // Check roundtrip
    const wgs84 = ProjectionLib.utmToWGS84(utm.x, utm.y, utm.zone, utm.isNorthernHemisphere)

    // Allow small floating point drift (~1e-8 degrees is < 1mm)
    assert.ok(Math.abs(wgs84[0] - lon) < 1e-8, `Lon mismatch: ${wgs84[0]} != ${lon}`)
    assert.ok(Math.abs(wgs84[1] - lat) < 1e-8, `Lat mismatch: ${wgs84[1]} != ${lat}`)
  })

  await t.test('Sydney (Zone 56S)', () => {
    // Sydney coordinates
    const lon = 151.2093
    const lat = -33.8688

    const utm = ProjectionLib.wgs84ToUTM(lon, lat)

    assert.strictEqual(utm.zone, 56)
    assert.strictEqual(utm.isNorthernHemisphere, false)

    const wgs84 = ProjectionLib.utmToWGS84(utm.x, utm.y, utm.zone, utm.isNorthernHemisphere)

    assert.ok(Math.abs(wgs84[0] - lon) < 1e-8, `Lon mismatch: ${wgs84[0]} != ${lon}`)
    assert.ok(Math.abs(wgs84[1] - lat) < 1e-8, `Lat mismatch: ${wgs84[1]} != ${lat}`)
  })
})
