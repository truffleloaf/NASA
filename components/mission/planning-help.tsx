import { Card } from '../ui/card';
import type { SiteId } from '@/lib/science';
export function PlanningHelp({expert,site}:{expert:boolean;site:SiteId}) {
  return <Card className="planning-help">
    {!expert&&<details><summary>How to read the sky</summary><dl>
      <dt>Elevation</dt><dd>Angle above a level horizon. Nearby terrain can still block a positive elevation.</dd>
      <dt>Azimuth</dt><dd>Compass direction, measured clockwise from north.</dd>
      <dt>Libration</dt><dd>The Moon's apparent rocking. The bundled ephemeris handles its effect on Earth direction.</dd>
      <dt>Permanently shadowed region</dt><dd>Terrain that never receives direct sunlight. This short planning period cannot establish permanent shadow.</dd>
    </dl></details>}
    <details><summary>Limits of this estimate</summary><ul>
      <li>Display terrain is about 594 m per pixel. Small ridges, boulders and steep crater walls are unresolved.</li>
      <li>Horizon profiles and visibility are estimated; an hourly sample does not give exact contact times.</li>
      <li>No atmospheric refraction is applied on the airless Moon. Libration is handled by JPL directions.</li>
      <li>Mast interpolation assumes the same underlying terrain. Metre-scale clearance is not validated by this DEM.</li>
      <li>Earth visibility means geometric line of sight, not a guaranteed radio link or relay service.</li>
    </ul><a className="text-link" href={`/methods/#source-${site}`}>NASA source data for this site</a></details>
  </Card>;
}
