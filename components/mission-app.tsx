"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, Orbit, Sun, Clock3 } from "lucide-react";
import { StatTile } from "./ui/stat-tile";
import { Skeleton } from "./ui/skeleton";
import { LandingHero } from "./landing/landing-hero";
const AppShell = dynamic(() => import("./mission/app-shell"), {
  loading: () => <Skeleton label="Opening mission control" />,
});
export default function MissionApp() {
  const [view, setView] = useState("landing");
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get("view");
    if (location.hash || requested) setView(requested || "explorer");
  }, []);
  if (view !== "landing")
    return (
      <AppShell
        initialView={view}
        onHome={() => {
          history.replaceState(null, "", "/");
          setView("landing");
        }}
      />
    );
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="/" aria-label="Lunar Mission Navigator home">
          <Orbit />
          <span>
            LUNAR<span className="brand-sub">MISSION NAVIGATOR</span>
          </span>
        </a>
        <nav aria-label="Introduction">
          <a href="/methods/" className="action-quiet">
            Methods & data
            <ArrowUpRight />
          </a>
          <button className="action-outline" onClick={() => setView("explorer")}>
            Open explorer
            <ArrowRight />
          </button>
        </nav>
      </header>
      <main id="main">
        <LandingHero onExplore={() => setView("explorer")} onCompare={() => setView("compare")} />
        <section className="landing-stats" aria-label="Data coverage">
          <StatTile
            label="Candidate regions"
            value={3}
            note="Compare representative south-pole sites"
            kind="Computed"
          />
          <StatTile
            label="Ephemeris coverage"
            value="2026"
            note="A full year of bundled JPL positions"
            kind="Computed"
          />
          <StatTile
            label="Sampling interval"
            value={1}
            unit="hour"
            note="Local calculations. No live data dependency."
            kind="Computed"
          />
        </section>
        <section className="method-intro">
          <div>
            <span className="mono-caps">From terrain to a working window</span>
            <h2>
              A little more certainty.
              <br />
              Before you leave Earth.
            </h2>
            <a className="text-link" href="/methods/">
              Explore the method
              <ArrowUpRight />
            </a>
          </div>
          <div className="method-steps">
            {[
              {
                icon: <Orbit />,
                title: "Choose your region",
                copy: "Explore south-polar terrain and compare the local horizons.",
              },
              {
                icon: <Sun />,
                title: "Set your constraints",
                copy: "Define sunlight, blackout tolerance, duration and mast height.",
              },
              {
                icon: <Clock3 />,
                title: "Find the overlap",
                copy: "Inspect estimated windows, trace the sources and share a brief.",
              },
            ].map((step) => (
              <article key={step.title}>
                {step.icon}
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>Independent NASA Space Apps project · Lunar Mission Navigator</span>
        <a href="/methods/">
          Sources, assumptions & limitations
          <ArrowUpRight />
        </a>
      </footer>
    </div>
  );
}
