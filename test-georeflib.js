import fetch from 'node-fetch'
import { PointGeoreferencer } from './index.js'

fetch('https://si.akita-u.info/2023/lu/akita_data.json').then(res => res.json()).then(data => {
  let controlPoints = data.controlPoints
  let lnglats = [], xys_img = [], xys_hatsu = []
  controlPoints.forEach(cp => {
    lnglats.push([cp.lng, cp.lat])
    xys_img.push([cp.coordinates.akita1936.x, cp.coordinates.akita1936.y])
    xys_hatsu.push([cp.coordinates.hatsusaburo.x, cp.coordinates.hatsusaburo.y])
  })
  console.log(lnglats)
  console.log(xys_img)
  console.log(xys_hatsu)
  let georef_lnglat_img = new PointGeoreferencer(lnglats, xys_img)
  let georef_lnglat_hatsu = new PointGeoreferencer(lnglats, xys_hatsu)
  let georef_img_hatsu = new PointGeoreferencer(xys_img, xys_hatsu)

  let res = georef_lnglat_hatsu.georefAffineWithTIN([140.1, 39.7])
  console.log(res)
  res = georef_lnglat_hatsu.georefInverseAffineWithTIN([4533, 636])
  console.log(res)
  res = georef_lnglat_img.georefAffineWithTIN([140.1, 39.7])
  console.log(res)
  res = georef_lnglat_img.georefInverseAffineWithTIN([2022, 850])
  console.log(res)
  res = georef_img_hatsu.georefAffineWithTIN([2022, 850])
  console.log(res)
  res = georef_img_hatsu.georefInverseAffineWithTIN([4533, 636])
  console.log(res)
})