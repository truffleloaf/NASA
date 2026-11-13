import test from "node:test";
import assert from "node:assert/strict";
import { lunarPoint, polarTextureUV } from "./scene-geometry";

test("NASA texture coordinates preserve poles, prime meridian and east longitude", () => {
  assert.deepEqual(lunarPoint(0, 0), [1, 0, -0]);
  const south = lunarPoint(-90, 0);
  assert.ok(Math.abs(south[0]) < 1e-12 && south[1] === -1);
  const east = lunarPoint(0, 90);
  assert.ok(Math.abs(east[0]) < 1e-12 && east[2] === -1);
  assert.equal(polarTextureUV(0, -100)[0], 0.5);
  assert.equal(polarTextureUV(100, 0)[0], 0.75);
  assert.equal(polarTextureUV(0, 0)[1], 0);
  assert.ok(polarTextureUV(100, 0)[1] > 0);
});
