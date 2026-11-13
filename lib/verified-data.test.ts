import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { verifyBundledAsset } from "./verified-data";
import audit from "../public/data/source-audit.json";

test("every shipped scientific asset matches the verified NASA source audit", async () => {
  for (const path of Object.keys(audit.assets)) {
    const bytes = Uint8Array.from(readFileSync(new URL("../public" + path, import.meta.url)));
    await verifyBundledAsset(path, bytes.buffer);
  }
  assert.equal(audit.sites.length, 6);
  for (const site of audit.sites) {
    assert.equal(site.queries.length, 2);
    assert.ok(site.queries.every(query => query.rowsCompared === 8761));
  }
});

test("corrupted or unverified scientific data is rejected before use", async () => {
  const path = "/data/ephemeris/de-gerlache.json";
  const bytes = Uint8Array.from(readFileSync(new URL("../public" + path, import.meta.url)));
  bytes[bytes.length - 1] ^= 1;
  await assert.rejects(verifyBundledAsset(path, bytes.buffer), /integrity check/);
  await assert.rejects(verifyBundledAsset("/data/unknown.json", bytes.buffer), /no verified NASA source/);
});
