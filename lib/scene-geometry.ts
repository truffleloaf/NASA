// NASA CGI maps place 0° longitude at u=0.5; Three's sphere places that point on +X.
export function lunarPoint(lat: number, lon: number, radius = 1): [number, number, number] {
  const a = lat * Math.PI / 180, b = lon * Math.PI / 180;
  return [radius * Math.cos(a) * Math.cos(b), radius * Math.sin(a), -radius * Math.cos(a) * Math.sin(b)];
}

export function polarTextureUV(eastKm: number, southKm: number): [number, number] {
  const lat = -Math.PI / 2 + 2 * Math.atan(Math.hypot(eastKm, southKm) / (2 * 1737.4));
  return [Math.atan2(eastKm, -southKm) / (2 * Math.PI) + 0.5, lat / Math.PI + 0.5];
}
