import fetch from 'node-fetch'
import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PointGeoreferencer, Crs } from './index.js'
import { Map } from './models/Map.js';
import { Point } from './models/Point.js';
import { Correspondence } from './models/Correspondence.js';

// Get the directory name from the URL of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));
// Path to the file
const filePath = join(__dirname, 'test_data.json');

console.log(filePath)

const coordinateObjectToArray = (coordinates, type) => {
  return type === 'latlng' ? [coordinates.lng, coordinates.lat] : [coordinates.x, coordinates.y];
};

fs.readFile(filePath, 'utf-8', (err, fdata) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }
  const data = JSON.parse(fdata);
  // console.log(data)
  const maps = data.maps.map(map => {
    const newMap = new Map(map.name, map.coordinateSystem);
    map.points.forEach(point => {
      const newPoint = new Point(point.coordinates, point.mapName, point.type);
      newPoint.id = point.id; // Preserve the ID
      newMap.addPoint(newPoint);
    });
    return newMap;
  });
  const correspondences = data.correspondences.map(correspondence => {
    const newCorrespondence = new Correspondence();
    correspondence.points.forEach(point => {
      const map = maps.find(m => m.name === point.mapName);
      if (map) {
        const pointInMap = map.points.find(p => p.id === point.id);
        if (pointInMap) {
          newCorrespondence.addPoint(pointInMap, point.index);
        }
      }
    });
    return newCorrespondence;
  });

  const map1 = maps[0];
  const map2 = maps[1];

  // if (!map1 || !map2) {
  //   console.error('One or both maps not found');
  //   return;
  // }

  const matchedCoordinatesMap1 = [];
  const matchedCoordinatesMap2 = [];
  const pointIds1 = []
  const pointIds2 = []

  // Filter correspondences that include points from both maps
  correspondences.forEach(correspondence => {
    const pointsMap1 = correspondence.points.filter(p => p.point.mapName === map1.name);
    const pointsMap2 = correspondence.points.filter(p => p.point.mapName === map2.name);
    if (pointsMap1.length && pointsMap2.length) {
      matchedCoordinatesMap1.push(coordinateObjectToArray(pointsMap1[0].point.coordinates, pointsMap1[0].point.type));
      matchedCoordinatesMap2.push(coordinateObjectToArray(pointsMap2[0].point.coordinates, pointsMap2[0].point.type));
      pointIds1.push(pointsMap1[0].point.id);
      pointIds2.push(pointsMap2[0].point.id);
    }
  });

  if (matchedCoordinatesMap1.length !== matchedCoordinatesMap2.length) {
    console.error('Mismatch in corresponding points between maps');
    return;
  }

  // console.log('Coordinates from Map1:', matchedCoordinatesMap1);
  // console.log('Coordinates from Map2:', matchedCoordinatesMap2);
  console.log("starting georeferencing")
  let crs1 = map1.coordinateSystem === 'xy' ? Crs.Simple : Crs.Geographic;
  let crs2 = map2.coordinateSystem === 'xy' ? Crs.Simple : Crs.Geographic;
  //  use these coordinates for georeferencing or other purposes
  const georefer1 = new PointGeoreferencer(
    matchedCoordinatesMap1, 
    matchedCoordinatesMap2, 
    crs1, 
    crs2
  );
  console.log("georeferencing done")
  console.log(georefer1.georefAffineWithTIN([140.11208879837486, 39.71031701796948]))
  // console.log(georefer1.georefAffineWithTriangleContains([140.11208879837486, 39.71031701796948]))
  // let controlPoints = data.controlPoints
  // let lnglats = [], xys_img = [], xys_hatsu = []
  // controlPoints.forEach(cp => {
  //   lnglats.push([cp.lng, cp.lat])
  //   xys_img.push([cp.coordinates.akita1936.x, cp.coordinates.akita1936.y])
  //   xys_hatsu.push([cp.coordinates.hatsusaburo.x, cp.coordinates.hatsusaburo.y])
  // })
  // console.log(lnglats)
  // console.log(xys_img)
  // console.log(xys_hatsu)
  // let georef_lnglat_img = new PointGeoreferencer(lnglats, xys_img, Crs.Geographic, Crs.Simple)
  // let georef_lnglat_hatsu = new PointGeoreferencer(lnglats, xys_hatsu, Crs.Geographic, Crs.Simple)
  // let georef_img_hatsu = new PointGeoreferencer(xys_img, xys_hatsu, Crs.Simple, Crs.Simple)

  // let res = georef_lnglat_hatsu.georefAffineWithTIN([140.1, 39.7])
  // console.log(res)
  // res = georef_lnglat_hatsu.georefInverseAffineWithTIN([4533, 636])
  // console.log(res)
  // res = georef_lnglat_img.georefAffineWithTIN([140.1, 39.7])
  // console.log(res)
  // res = georef_lnglat_img.georefInverseAffineWithTIN([2022, 850])
  // console.log(res)
  // res = georef_img_hatsu.georefAffineWithTIN([2022, 850])
  // console.log(res)
  // res = georef_img_hatsu.georefInverseAffineWithTIN([4533, 636])
  // console.log(res)
})