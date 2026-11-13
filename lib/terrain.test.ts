import test from 'node:test';
import assert from 'node:assert/strict';
import { polarForward, polarInverse, terrainAt, distanceKm } from './terrain';
test('polar projection round trips the southern cap across the date line', () => {
  for (const lat of [-89.9,-88.7,-85.99,-80]) for (const lon of [-179,-68.7,0,90,179]) {
    const p=polarInverse(...polarForward(lat,lon));
    assert.ok(Math.abs(p.lat-lat)<1e-10); assert.ok(Math.abs(p.lon-lon)<1e-10);
  }
  assert.deepEqual(polarInverse(0,0), {lat:-90,lon:0});
});
test('terrain boundaries and flat DEM slope are honest', () => {
  const flat = new Uint16Array(1024*1024).fill(32000);
  assert.equal(terrainAt(flat,0,0)?.slope,0);
  assert.equal(terrainAt(flat,400,0),null);
  assert.equal(terrainAt(new Uint16Array(),0,0),null);
  assert.equal(distanceKm(-90,0,-90,0),0);
  assert.ok(distanceKm(-89,0,-89,90)>40);
});
