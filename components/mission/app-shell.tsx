"use client";
import { useEffect, useState } from "react";
import { Orbit, FileDown, Link as LinkIcon, SlidersHorizontal, ArrowRight, HelpCircle } from "lucide-react";
import { useMission, SITES } from "./use-mission";
import { SetupPanel } from "./setup-panel";
import { MapPanel } from "./map-panel";
import { TimePanel } from "./time-panel";
import { InsightsPanel } from "./insights-panel";
import { CompareView } from "./compare-view";
import { WindowsView } from "./windows-view";
import { BriefView } from "./brief-view";
import { Segmented } from "../ui/segmented";
import { Sheet } from "../ui/sheet";
import { Toast } from "../ui/toast";
import { Card } from "../ui/card";
import { Chip } from "../ui/chip";
import { ProvenanceBadge } from "../ui/provenance-badge";
export default function AppShell({ initialView, onHome }: { initialView: string; onHome: () => void }) {
  const m = useMission(),
    [view, setView] = useState(["compare", "windows", "brief"].includes(initialView) ? initialView : "explorer");
  const [limits, setLimits] = useState(false),
    [tour, setTour] = useState(-1);
  useEffect(() => {
    try {
      if (!localStorage.getItem("lunar-tour-v2") && !location.hash) setTour(0);
    } catch {
      /* Storage is optional. */
    }
  }, []);
  const changeView = (next: string) => {
    setView(next);
    const url = new URL(location.href);
    url.searchParams.set("view", next);
    history.replaceState(null, "", url);
  };
  const closeTour = () => {
    setTour(-1);
    try {
      localStorage.setItem("lunar-tour-v2", "done");
    } catch {
      /* Storage is optional. */
    }
  };
  const find = () => {
    setLimits(false);
    changeView("windows");
    m.notify(
      m.result.windows.length
        ? "Operating windows recalculated from bundled data."
        : "No qualifying windows. See the suggested limit adjustment.",
    );
  };
  const steps = [
    {
      title: "Start with a place",
      text: "Choose a representative region and a date range. The map shows real LOLA terrain; every result links to its provenance.",
    },
    {
      title: "Tell us what you need",
      text: "Set sunlight, mission duration and tolerable communication gaps. Raising the mast changes the estimated Earth horizon, not sunlight.",
    },
    {
      title: "Read the overlap",
      text: "Amber means sunlight, blue means Earth visibility, green means an operating window. Inspect the reason each window ends, then copy a link or export a brief.",
    },
  ];
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <button className="brand" onClick={onHome} aria-label="Lunar Mission Navigator home">
          <Orbit />
          <span>
            LUNAR<span className="brand-sub">MISSION NAVIGATOR</span>
          </span>
        </button>
        <Segmented
          label="Mission navigation"
          value={view}
          options={[
            { value: "explorer", label: "Explorer" },
            { value: "compare", label: "Compare" },
            { value: "windows", label: "Windows" },
          ]}
          onChange={changeView}
        />
        <div className="header-actions">
          <ProvenanceBadge
            kind="Computed"
            detail="Source ephemerides and DEM are computed. Window predictions and horizon masks are estimated."
          />
          <button className="icon-control" onClick={m.copyLink} aria-label="Copy mission share link">
            <LinkIcon />
          </button>
          <button className="action-outline" onClick={() => changeView("brief")}>
            <FileDown />
            <span>Export brief</span>
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="workspace-topline">
          <div>
            <span className="mono-caps">Lunar south pole / mission planning</span>
            <p>Understand the overlap. Plan for the limits.</p>
          </div>
          <div className="button-row">
            <button className="action-outline setup-trigger" onClick={() => setLimits(true)}>
              <SlidersHorizontal />
              Mission setup
            </button>
            <button className="icon-control" aria-label="Show introduction" onClick={() => setTour(0)}>
              <HelpCircle />
            </button>
            <a href="/methods/" className="action-quiet">
              Methods & data
            </a>
          </div>
        </div>
        {m.error && (
          <p className="data-warning" role="alert">
            Some bundled data could not be loaded. {m.error}
          </p>
        )}
        {view === "explorer" ? (
          <>
            <div className="mobile-sites site-chips">
              {SITES.map((site) => (
                <Chip key={site.id} selected={m.config.site === site.id} onClick={() => m.update({ site: site.id })}>
                  {site.name}
                </Chip>
              ))}
            </div>
            <div className="explorer-grid">
              <Card className="setup-panel">
                <SetupPanel mission={m} onFind={find} />
              </Card>
              <div className="center-column">
                <MapPanel mission={m} />
                <TimePanel mission={m} />
              </div>
              <InsightsPanel mission={m} />
            </div>
          </>
        ) : view === "compare" ? (
          <CompareView mission={m} onExplore={() => changeView("explorer")} />
        ) : view === "windows" ? (
          <WindowsView
            mission={m}
            onExplore={() => {
              changeView("explorer");
            }}
          />
        ) : (
          <BriefView mission={m} />
        )}
      </main>
      <footer className="site-footer">
        <span>Visibility is an estimate, not a flight clearance.</span>
        <a href="/methods/">
          Trace the data & assumptions
          <ArrowRight />
        </a>
      </footer>
      <div className="mobile-bottom">
        <button className="action-outline" onClick={() => setLimits(true)}>
          <SlidersHorizontal />
          Limits
        </button>
        <button className="action-primary" onClick={find}>
          Find windows
          <ArrowRight />
        </button>
      </div>
      <Sheet
        open={limits}
        onOpenChange={setLimits}
        title="Mission setup"
        description="Choose a region, period and operating limits."
      >
        <SetupPanel mission={m} onFind={find} />
      </Sheet>
      <Sheet
        open={tour >= 0}
        onOpenChange={(open) => {
          if (!open) closeTour();
        }}
        modal
        title={steps[tour]?.title || "Welcome"}
        description="A short introduction to Lunar Mission Navigator."
      >
        <p className="tour-copy">{steps[tour]?.text}</p>
        <div className="tour-dots" aria-label={`Introduction step ${tour + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <i key={i} className={i === tour ? "active" : ""} />
          ))}
        </div>
        <div className="row-between">
          <button className="action-quiet" onClick={closeTour}>
            Skip introduction
          </button>
          <button className="action-primary" onClick={() => (tour < 2 ? setTour(tour + 1) : closeTour())}>
            {tour < 2 ? "Next" : "Start exploring"}
            <ArrowRight />
          </button>
        </div>
      </Sheet>
      <Toast message={m.message} />
    </div>
  );
}
