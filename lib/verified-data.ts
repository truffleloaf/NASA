import audit from "@/public/data/source-audit.json";

const TEXT_ASSET = /\.(json|lbl|txt|csv)$/i;

/**
 * Hash the LF form of text assets: Git stores them with LF, but a Windows
 * checkout with core.autocrlf rewrites them to CRLF, so hashing the raw bytes
 * depends on the platform. Binary assets are hashed unchanged.
 */
function canonicalBytes(path: string, bytes: ArrayBuffer): Uint8Array<ArrayBuffer> {
  const view = new Uint8Array(bytes);
  if (!TEXT_ASSET.test(path) || !view.includes(0x0d)) return view;
  let length = 0;
  for (const byte of view) {
    if (byte !== 0x0d) length += 1;
  }
  const out = new Uint8Array(length);
  let index = 0;
  for (const byte of view) {
    if (byte !== 0x0d) out[index++] = byte;
  }
  return out;
}

/** Reject missing, stale or corrupted files instead of calculating plausible wrong results. */
export async function verifyBundledAsset(path: string, bytes: ArrayBuffer): Promise<void> {
  const expected = (audit.assets as Record<string, string>)[path];
  if (!expected) throw new Error("This data asset has no verified NASA source record.");
  if (!globalThis.crypto?.subtle) throw new Error("Data integrity checks require HTTPS or localhost.");
  const hash = await crypto.subtle.digest("SHA-256", canonicalBytes(path, bytes));
  const actual = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) throw new Error("Bundled NASA data failed its integrity check. Reload or restore the verified data files.");
}
