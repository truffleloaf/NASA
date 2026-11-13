import type { Metadata } from "next";
import { ArrowLeft, Orbit } from "lucide-react";
import validation from "@/public/data/validation.json";
import { Card } from "@/components/ui/card";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { DataSources } from "@/components/mission/data-sources";
export const metadata: Metadata = {
  title: "Methods & validation — Lunar Mission Navigator",
  description: "Sources, formulas, data resolution and honest limits of lunar operating-window estimates.",
};
export default function MethodsPage() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/">
          <Orbit />
          <span>
            LUNAR<span className="brand-sub">MISSION NAVIGATOR</span>
          </span>
        </a>
        <a className="action-outline" href="/?view=explorer">
          <ArrowLeft />
          Back to explorer
        </a>
      </header>
      <main id="main" className="methods-page">
        <span className="mono-caps">Methods & validation</span>
        <h1>
          Every window has a source.
          <br />
          Every estimate has limits.
        </h1>
        <p>
          This tool combines observed lunar topography with calculated Sun and Earth directions. It is an exploratory
          planning aid, with no claim of flight readiness.
        </p>
        <Card>
          <h2>How to read the badges</h2>
          <p>
            <ProvenanceBadge kind="Computed" /> A value read straight from the bundled datasets: Sun
            and Earth directions and angular diameters from the JPL ephemeris, elevation samples from the LOLA DEM, and
            dataset dimensions. No modelling step sits between the file and the number.
          </p>
          <p>
            <ProvenanceBadge /> A value that needs a model between the data and the number: terrain horizons,
            interpolated samples, visibility percentages, window times, mast deltas, fit ranks and heatmap hours.
            Representative site coordinates are planning references, not surveyed or NASA-approved landing pads.
          </p>
          <p>
            <ProvenanceBadge kind="Illustrative" /> A visual aid, such as the landing Moon, exaggerated relief or
            rendered shadows. The rendered shadow map is not used to calculate operating windows.
          </p>
        </Card>
        <Card>
          <h2>
            Bundled source data <ProvenanceBadge kind="Computed" />
          </h2>
          <ul>
            <li>
              <a href="https://imbrium.mit.edu/DATA/LOLA_GDR/POLAR/IMG/LDEM_80S_80M.LBL">LRO LOLA LDEM_80S_80M</a>:
              south-polar stereographic DEM, 80 m pixels, 0.5 m per digital unit, covering 80–90° S. Reference sphere:
              1,737.4 km. The display is downsampled to 1,024 × 1,024 pixels, approximately 594 m per pixel.
            </li>
            <li>
              <a href="/data/terrain/polar-1024-lroc.json">LROC WAC south-pole summer mosaic</a> (NASA/GSFC/ASU,
              WAC_ROI_SOUTH_SUMMER_128P, 236.9 m per pixel): context imagery only, resampled to the same 1,024 × 1,024
              grid. Its illumination is fixed to the 2010 southern summer, so the baked shadows are not the simulated
              date. The image is never used for a direction, horizon or window.
            </li>
            <li>
              <a href="https://ssd.jpl.nasa.gov/horizons/manual.html">NASA/JPL Horizons</a>: DE441 apparent airless
              topocentric Sun/Earth azimuth, elevation and angular diameter at hourly intervals throughout 2026. Each
              site includes 8,761 samples, including the following midnight endpoint.
            </li>
            <li>
              <a href="/data/manifest.json">Data manifest</a>,{" "}
              <a href="/data/terrain/polar-1024.json">terrain header and checksum</a>, and{" "}
              <a href="/data/validation.json">reference checks with query URLs and hashes</a> are shipped with this
              application. Raw query provenance is also recorded in each site's ephemeris asset.
            </li>
          </ul>
          <p>
            There are no runtime requests to JPL or other external services. The browser reads only bundled, same-origin
            static assets.
          </p>
        </Card>
        <DataSources />
        <Card>
          <h2>Site-specific limits</h2>
          <p>
            The six sites are not equally constrained. These notes come from the cross-product check against the
            independent 40 m DEM and from each site&apos;s horizon metadata; the full table is in <code>docs/DATA.md</code>.
          </p>
          <ul>
            <li>
              <strong>Nobile Rim 1</strong>: the 40 m comparison covers 136 of 360 azimuths and disagrees at 2 m
              (p95 2.80°, median +1.01°), while the 20 m median agrees to 0.01°. The two DEMs resolve its steep
              near-field rim differently; that row is a documented discrepancy, not agreement.
            </li>
            <li>
              <strong>Mons Mouton</strong>: at 84.6° S the northern 150 km rays leave the nominal 80–90° S coverage and
              sample the source DEM&apos;s square corners. The limitation is recorded in that site&apos;s horizon file.
            </li>
            <li>
              <strong>Artemis sites</strong>: the 40 m cross-check covers only 123–168 of 360 azimuths for Mons Mouton,
              Nobile Rim 1 and Haworth, because the comparison DEM ends at 85° S. Those rows do not validate a whole
              site or its windows.
            </li>
          </ul>
        </Card>
        <Card>
          <h2>
            From elevations to windows <ProvenanceBadge />
          </h2>
          <ol>
            <li>
              At each representative site, rays sample the original 80 m DEM every 80 m, for 360 azimuths, out to 150
              km. The highest apparent terrain angle along each ray is the horizon. Curvature uses the reference sphere
              and sampled radial heights.
            </li>
            <li>
              Horizon elevation follows <code>atan2(r₁ cos θ − r₀, r₁ sin θ)</code>, with observer radius r₀ including
              mast height, terrain radius r₁ and angular separation θ. Adjacent azimuth samples interpolate linearly.
            </li>
            <li>
              Earth visibility is true when the Earth centre elevation exceeds the horizon. Mast height interpolates
              between the separately raycast 2 m and 20 m masks. Sunlight uses the 2 m baseline regardless of the
              antenna setting.
            </li>
            <li>
              Sunlight runs must be continuous. Within each sunlit run, Earth-visible segments are merged only when each
              intervening gap is no longer than the blackout allowance. A window must meet both the minimum sunlight and
              mission-duration thresholds. With a zero blackout allowance, both conditions hold throughout every
              returned window.
            </li>
            <li>
              Earth uptime is visible hourly samples divided by total samples. The mast delta compares against the 2 m
              baseline for the same period. Windows rank by duration, then uptime, then start time. “Duration covered”
              is the longest qualifying window divided by the selected planning period; it is not a safety score.
            </li>
            <li>
              The annual heatmap counts hours falling inside qualifying windows for each day, applying the current
              limits across the full bundled year. A click selects that day's month. Monthly recomputation can shorten
              windows at the period edges.
            </li>
          </ol>
        </Card>
        <Card>
          <h2>
            Reference crossing checks <ProvenanceBadge />
          </h2>
          <p>
            Each shipped site, plus two numerical reference points, compares solar-centre zero-elevation crossings interpolated from hourly samples with
            separately requested one-minute JPL Horizons samples. All times are UTC. These are same-source sampling
            checks with a flat astronomical horizon,{" "}
            <strong>not independent model validation or terrain sunrise/sunset predictions</strong>.
          </p>
          <div className="table-scroll">
            <table>
              <caption>
                Hourly interpolation versus one-minute Horizons interpolation. Differences shown in seconds.
              </caption>
              <thead>
                <tr>
                  <th>Reference point</th>
                  <th>Event</th>
                  <th>Hourly crossing UTC</th>
                  <th>JPL minute crossing UTC</th>
                  <th>Difference</th>
                </tr>
              </thead>
              <tbody>
                {validation.rows.flatMap((row) =>
                  (["sunrise", "sunset"] as const).map((event) => (
                    <tr key={row.id + event}>
                      <th>
                        {row.name}
                        <br />
                        {row.lat}°, {row.lon}°
                      </th>
                      <td>{event}</td>
                      <td>{row[event].hourlyInterpolatedUtc.replace("T", " ")}</td>
                      <td>
                        <a href={row[event].sourceUrl}>{row[event].horizonsMinuteInterpolatedUtc.replace("T", " ")}</a>
                      </td>
                      <td>{row[event].differenceSeconds.toFixed(3)} s</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
          <p>
            The largest absolute difference in these checks is{" "}
            {Math.max(
              ...validation.rows.flatMap((r) => [
                Math.abs(r.sunrise.differenceSeconds),
                Math.abs(r.sunset.differenceSeconds),
              ]),
            ).toFixed(3)}{" "}
            seconds. This does not imply equivalent precision for window boundaries, which remain hourly estimates.
          </p>
        </Card>
        <Card>
          <h2>
            Known limitations <ProvenanceBadge />
          </h2>
          <ul>
            <li>
              Representative site coordinates are not certified landing pads. Terrain slopes, boulders, thermal
              conditions, power storage, landing hazards and radio link budgets are not assessed.
            </li>
            <li>
              An 80 m DEM cannot resolve metre-scale obstructions or establish a reliable benefit from a small mast
              increase. Mast comparisons are sensitivity illustrations based on the terrain model.
            </li>
            <li>
              The LOLA ME/PA DE421 frame and Horizons MEAN_ME frame are not transformed into a common high-precision
              reference frame. Frame offsets introduce additional uncertainty.
            </li>
            <li>
              Horizon rays stop at 150 km. No visibility guarantee is made for obstructions beyond this range or below
              the grid resolution.
            </li>
            <li>
              Centre-of-disc visibility ignores partial solar illumination, antenna pointing limits, Fresnel clearance,
              Earth ground-station placement and lunar relay satellites. Earth in sight does not guarantee a usable
              link.
            </li>
            <li>
              Hourly sampling can miss shorter events. No artificial precision or fabricated results fill missing
              periods; data outside 2026 is unavailable.
            </li>
            <li>
              Polar lighting uses a coarser, exaggerated mesh with a finite-resolution shadow map. Surface silhouettes
              use the stored horizon mask; stars are decorative. Only the calculations described above determine
              windows.
            </li>
          </ul>
        </Card>
      </main>
      <footer className="site-footer">
        <span>Independent NASA Space Apps project. No NASA endorsement implied.</span>
        <a href="/?view=explorer">
          Return to mission planning
          <ArrowLeft />
        </a>
      </footer>
    </>
  );
}
