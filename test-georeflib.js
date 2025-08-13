import fs from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { PointGeoreferencer, Crs } from './index.js';
import { Map } from './models/Map.js';
import { Point } from './models/Point.js';
import { Correspondence } from './models/Correspondence.js';

// Get the directory name from the URL of the current module
const __dirname = dirname(fileURLToPath(import.meta.url));
// Path to the file
const filePath = join(__dirname, 'test_data.json');

console.log("Reading test data from:", filePath);

const coordinateObjectToArray = (coordinates, type) => {
  return type === 'latlng' ? [coordinates.lng, coordinates.lat] : [coordinates.x, coordinates.y];
};

fs.readFile(filePath, 'utf-8', (err, fdata) => {
  if (err) {
    console.error('Error reading the file:', err);
    return;
  }
  const data = JSON.parse(fdata);
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

  const matchedCoordinatesMap1 = [];
  const matchedCoordinatesMap2 = [];

  // Filter correspondences that include points from both maps
  correspondences.forEach(correspondence => {
    const pointsMap1 = correspondence.points.filter(p => p.point.mapName === map1.name);
    const pointsMap2 = correspondence.points.filter(p => p.point.mapName === map2.name);
    if (pointsMap1.length && pointsMap2.length) {
      matchedCoordinatesMap1.push(coordinateObjectToArray(pointsMap1[0].point.coordinates, pointsMap1[0].point.type));
      matchedCoordinatesMap2.push(coordinateObjectToArray(pointsMap2[0].point.coordinates, pointsMap2[0].point.type));
    }
  });

  if (matchedCoordinatesMap1.length === 0) {
    console.error('No matching control points found between maps.');
    return;
  }

  console.log(`Found ${matchedCoordinatesMap1.length} matching control points.`);
  
  let crs1 = map1.coordinateSystem === 'xy' ? Crs.Simple : Crs.Geographic;
  let crs2 = map2.coordinateSystem === 'xy' ? Crs.Simple : Crs.Geographic;
  
  // Use these coordinates for georeferencing or other purposes
  const georeferencer = new PointGeoreferencer(
    matchedCoordinatesMap1, 
    matchedCoordinatesMap2, 
    crs1, 
    crs2
  );
  
  console.log("Georeferencer created. Now testing transformation methods...");

  // ---- NEW TEST SECTION ----
  
  // Select a point to test the transformations. We'll use the first control point.
  const testPoint = matchedCoordinatesMap1[0];
  const expectedTransformedPoint = matchedCoordinatesMap2[0];
  
  console.log("\n==============================================");
  console.log("         Testing New Methods");
  console.log("==============================================");
  console.log(`\nTest Point:         [${testPoint.join(', ')}]`);
  console.log(`Expected Result:    [${expectedTransformedPoint.join(', ')}] (from control points)`);
  
  // 1. Test Polynomial (Order 1)
  console.log("\n--- 1. Polynomial (Order 1) ---");
  const poly1Result = georeferencer.georefPolynomial(testPoint, 1);
  if (poly1Result) {
      console.log(`Result:             [${poly1Result.join(', ')}]`);
  }

  // 2. Test Polynomial (Order 2)
  console.log("\n--- 2. Polynomial (Order 2) ---");
  const poly2Result = georeferencer.georefPolynomial(testPoint, 2);
  if (poly2Result) {
      console.log(`Result:             [${poly2Result.join(', ')}]`);
  } else {
      console.log("Could not run test. Not enough control points for a 2nd order polynomial (need at least 6).");
  }

  // 3. Test Polynomial (Order 3)
  console.log("\n--- 3. Polynomial (Order 3) ---");
  const poly3Result = georeferencer.georefPolynomial(testPoint, 3);
  if (poly3Result) {
      console.log(`Result:             [${poly3Result.join(', ')}]`);
  } else {
      console.log("Could not run test. Not enough control points for a 3rd order polynomial (need at least 6).");
  }
  
  // 4. Test Thin Plate Spline (TPS)
  console.log("\n--- 4. Thin Plate Spline (TPS) ---");
  const tpsResult = georeferencer.georefTPS(testPoint);
  if (tpsResult) {
      console.log(`Result:             [${tpsResult.join(', ')}]`);
  }
  console.log("\n==============================================\n");
});