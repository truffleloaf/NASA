import audit from "@/public/data/source-audit.json";
import { coordinates } from "@/lib/planning";
import { Card } from "../ui/card";
import { ProvenanceBadge } from "../ui/provenance-badge";

export function DataSources() {
  return <>
    <Card>
      <h2>NASA source verification <ProvenanceBadge kind="Computed" /></h2>
      <p>
        Checked {audit.checkedAtUtc.slice(0, 10)} UTC against {audit.mode === "fresh-horizons-responses"
          ? "fresh NASA/JPL Horizons responses" : "the original recorded NASA/JPL Horizons responses"}.
        Every bundled Sun and Earth row matched the source at the stored precision.
        The app checks the downloaded ephemeris, horizon and terrain files against their recorded SHA-256 checksums before use.
      </p>
      <p>
        This verifies data origin and integrity, not flight accuracy. Terrain visibility, mast effects and operating
        windows still use an approximate model and remain <ProvenanceBadge />.
      </p>
      <div className="table-scroll">
        <table>
          <caption>Site-specific NASA inputs. Observer altitude includes the baseline mast above DEM terrain.</caption>
          <thead><tr><th>Representative site</th><th>Observer</th><th>Coverage / source samples</th><th>Download and reproduce</th></tr></thead>
          <tbody>{audit.sites.map(site => <tr key={site.id} id={`source-${site.id}`}>
            <th>{site.name}</th>
            <td>{coordinates(site.observer.latitudeDegrees, site.observer.eastLongitudeDegrees)}<br />
              {site.observer.altitudeMeters.toFixed(2)} m above the reference sphere <ProvenanceBadge />
            </td>
            <td>{site.start.slice(0, 10)} → {site.end.slice(0, 10)} UTC<br />
              {site.queries[0].rowsCompared.toLocaleString("en-GB")} hourly samples per body <ProvenanceBadge kind="Computed" />
            </td>
            <td><a href={`/data/ephemeris/${site.id}.json`}>Bundled ephemeris</a><br />
              <a href={`/data/horizon/${site.id}.json`}>Estimated terrain horizon</a><br />
              {site.queries.map(query => <span key={query.body}><a href={query.url}>Reproduce {query.body} query at JPL</a><br /></span>)}
            </td>
          </tr>)}</tbody>
        </table>
      </div>
      <p><a href="/data/source-audit.json" download>Download source audit and checksums</a>. Raw-response hashes,
        observer settings and source URLs are included. The original LOLA DEM is checked against its recorded source hash.</p>
    </Card>
    <Card>
      <h2>Challenge resources</h2>
      <p>The following resources are linked for their actual roles; map portals and educational material are not substituted for numerical inputs.</p>
      <ul>
        <li><a href="https://ssd.jpl.nasa.gov/horizons/">NASA/JPL Horizons</a> supplies the Sun/Earth directions and angular diameters used by this planner.</li>
        <li><a href="https://quickmap.lroc.asu.edu/">LROC QuickMap</a> lets you inspect lunar imagery and terrain in the challenge’s recommended mapping tool. For this planner, terrain comes from the original <a href={audit.terrainSource.labelUrl}>LRO LOLA product</a>, not a screenshot.</li>
        <li><a href="https://trek.nasa.gov/moon/">NASA Moon Trek</a> provides a separate lunar exploration and terrain-viewing resource. Its display is not used as a numerical horizon mask here.</li>
        <li><a href="https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/">CSA Moon Exploration</a> provides mission context and educational resources, not ephemeris measurements.</li>
        <li><a href="https://github.com/nasa/spaceapps">Space Apps Connect</a> is the community discussion space.</li>
      </ul>
      <p>Independent project. NASA does not endorse this application. External resources have their own data-use terms.</p>
    </Card>
  </>;
}
