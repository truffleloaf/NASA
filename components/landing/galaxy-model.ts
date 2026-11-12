export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function makeStars(mobile: boolean) {
  const random = seededRandom(301);
  return [
    [160, 0.5, 0.9, 0.25, 0.5, 0.002, 3],
    [80, 0.9, 1.3, 0.45, 0.7, 0.0035, 6],
    [28, 1.3, 2, 0.7, 1, 0.0055, 10],
  ].flatMap(([count, minR, maxR, minA, maxA, speed, parallax], layer) =>
    Array.from({ length: Math.round(count * (mobile ? 0.6 : 1)) }, () => ({
      layer,
      speed,
      parallax,
      orbit: Math.sqrt(random()) * 1.1,
      angle: random() * Math.PI * 2,
      radius: minR + random() * (maxR - minR),
      alpha: minA + random() * (maxA - minA),
      period: 3 + random() * 4,
      phase: random() * Math.PI * 2,
    })),
  );
}
