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
  
  const georeferencer = new PointGeoreferencer(
    matchedCoordinatesMap1, 
    matchedCoordinatesMap2, 
    crs1, 
    crs2
  );
  
  console.log("Georeferencer created. Now testing transformation methods...");

  const testPointForward = matchedCoordinatesMap1[0];
  const expectedResultForward = matchedCoordinatesMap2[0];
  
  console.log("\n==============================================");
  console.log("         Testing Forward Transformations");
  console.log("==============================================");
  console.log(`\nTest Point:         [${testPointForward.join(', ')}]`);
  console.log(`Expected Result:    [${expectedResultForward.join(', ')}]`);
  
  console.log("\n--- Polynomial (Order 1) ---");
  const poly1Result = georeferencer.georefPolynomial(testPointForward, 1);
  if (poly1Result) console.log(`Result:             [${poly1Result.join(', ')}]`);

  console.log("\n--- Polynomial (Order 2) ---");
  const poly2Result = georeferencer.georefPolynomial(testPointForward, 2);
  if (poly2Result) console.log(`Result:             [${poly2Result.join(', ')}]`);
  else console.log("Skipped: Not enough points for 2nd order polynomial (need 6).");

  console.log("\n--- Polynomial (Order 3) ---");
  const poly3Result = georeferencer.georefPolynomial(testPointForward, 3);
  if (poly3Result) console.log(`Result:             [${poly3Result.join(', ')}]`);
  else console.log("Skipped: Not enough points for 3rd order polynomial (need 10).");
  
  console.log("\n--- Thin Plate Spline (TPS) ---");
  const tpsResult = georeferencer.georefTPS(testPointForward);
  if (tpsResult) console.log(`Result:             [${tpsResult.join(', ')}]`);

  // ---- NEW INVERSE TEST SECTION ----
  
  const testPointInverse = matchedCoordinatesMap2[0];
  const expectedResultInverse = matchedCoordinatesMap1[0];

  console.log("\n==============================================");
  console.log("         Testing Inverse Transformations");
  console.log("==============================================");
  console.log(`\nTest Point:         [${testPointInverse.join(', ')}]`);
  console.log(`Expected Result:    [${expectedResultInverse.join(', ')}]`);

  console.log("\n--- Inverse Polynomial (Order 1) ---");
  const invPoly1Result = georeferencer.georefInversePolynomial(testPointInverse, 1);
  if (invPoly1Result) console.log(`Result:             [${invPoly1Result.join(', ')}]`);

  console.log("\n--- Inverse Polynomial (Order 2) ---");
  const invPoly2Result = georeferencer.georefInversePolynomial(testPointInverse, 2);
  if (invPoly2Result) console.log(`Result:             [${invPoly2Result.join(', ')}]`);
  else console.log("Skipped: Not enough points for 2nd order polynomial (need 6).");

  console.log("\n--- Inverse Polynomial (Order 3) ---");
  const invPoly3Result = georeferencer.georefInversePolynomial(testPointInverse, 3);
  if (invPoly3Result) console.log(`Result:             [${invPoly3Result.join(', ')}]`);
  else console.log("Skipped: Not enough points for 3rd order polynomial (need 10).");

  console.log("\n--- Inverse Thin Plate Spline (TPS) ---");
  const invTpsResult = georeferencer.georefInverseTPS(testPointInverse);
  if (invTpsResult) console.log(`Result:             [${invTpsResult.join(', ')}]`);

  console.log("\n==============================================\n");
});