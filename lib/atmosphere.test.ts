import test from "node:test";
import assert from "node:assert/strict";
import { makeStars, seededRandom } from "../components/landing/galaxy-model";
test("decorative star field is deterministic, bounded and lighter on mobile", () => {
  assert.deepEqual(makeStars(false), makeStars(false));
  assert.equal(makeStars(false).length, 268);
  assert.equal(makeStars(true).length, 161);
  for (const star of makeStars(false)) {
    assert.ok(star.radius >= 0.5 && star.radius <= 2);
    assert.ok(star.period >= 3 && star.period <= 7);
    assert.ok(star.parallax <= 10);
  }
  const random = seededRandom(1);
  for (let i = 0; i < 1000; i++) {
    const n = random();
    assert.ok(n >= 0 && n < 1);
  }
});
test("protected copy clears AA even over a fully white nebula texture", () => {
  const luminance = (rgb: number[]) =>
    rgb
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const background = [5, 7, 12].map((v) => v * (1 - 0.035) + 255 * 0.035);
  const ratio = (luminance([140, 151, 168]) + 0.05) / (luminance(background) + 0.05);
  assert.ok(ratio >= 4.5);
  console.log(`Conservative hero muted-text contrast: ${ratio.toFixed(2)}:1`);
});
