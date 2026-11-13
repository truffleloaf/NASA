import audit from "@/public/data/source-audit.json";

/** Reject missing, stale or corrupted files instead of calculating plausible wrong results. */
export async function verifyBundledAsset(path: string, bytes: ArrayBuffer): Promise<void> {
  const expected = (audit.assets as Record<string, string>)[path];
  if (!expected) throw new Error("This data asset has no verified NASA source record.");
  if (!globalThis.crypto?.subtle) throw new Error("Data integrity checks require HTTPS or localhost.");
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const actual = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
  if (actual !== expected) throw new Error("Bundled NASA data failed its integrity check. Reload or restore the verified data files.");
}
