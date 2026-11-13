import header from '../public/data/terrain/polar-1024.json';
const DEG = Math.PI / 180;
export function polarForward(lat: number, lon: number): [number, number] {
  const r = 2 * header.referenceRadiusKm * Math.tan(Math.PI / 4 + lat * DEG / 2);
  return [r * Math.sin(lon * DEG), -r * Math.cos(lon * DEG)];
}
export function polarInverse(eastKm: number, southKm: number) {
  return { lat: -90 + 2 * Math.atan(Math.hypot(eastKm, southKm) / (2 * header.referenceRadiusKm)) / DEG,
    lon: Math.hypot(eastKm, southKm) < 1e-9 ? 0 : Math.atan2(eastKm, -southKm) / DEG };
}
export function elevationAt(heights: Uint16Array, eastKm: number, southKm: number): number | null {
  if (heights.length !== header.width * header.height || !Number.isFinite(eastKm + southKm) || Math.hypot(eastKm, southKm) > header.validRadiusKm) return null;
  const x = Math.max(0, Math.min(header.width-1, eastKm/header.kmPerPixel + header.width/2 - .5));
  const y = Math.max(0, Math.min(header.height-1, southKm/header.kmPerPixel + header.height/2 - .5));
  const col = Math.floor(x), row = Math.floor(y), fx = x-col, fy=y-row;
  const at = (c:number,r:number) => header.minMeters + heights[Math.min(header.height-1,r)*header.width+Math.min(header.width-1,c)]*header.scaleMeters;
  return (at(col,row)*(1-fx)+at(col+1,row)*fx)*(1-fy)+(at(col,row+1)*(1-fx)+at(col+1,row+1)*fx)*fy;
}
export function terrainAt(heights: Uint16Array, eastKm: number, southKm: number) {
  const elevation = elevationAt(heights,eastKm,southKm);
  if (elevation === null) return null;
  const step = header.kmPerPixel;
  const dx=((elevationAt(heights,eastKm+step,southKm)??elevation)-(elevationAt(heights,eastKm-step,southKm)??elevation))/(step*2000);
  const dz=((elevationAt(heights,eastKm,southKm+step)??elevation)-(elevationAt(heights,eastKm,southKm-step)??elevation))/(step*2000);
  return {...polarInverse(eastKm,southKm), elevation, slope:Math.atan(Math.hypot(dx,dz))/DEG};
}
export function distanceKm(latA:number,lonA:number,latB:number,lonB:number) {
  const a=Math.sin((latB-latA)*DEG/2)**2+Math.cos(latA*DEG)*Math.cos(latB*DEG)*Math.sin((lonB-lonA)*DEG/2)**2;
  return 2*header.referenceRadiusKm*Math.asin(Math.sqrt(Math.min(1,a)));
}
export type TerrainReading = NonNullable<ReturnType<typeof terrainAt>>;
