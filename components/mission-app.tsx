"use client";
import dynamic from "next/dynamic";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Crosshair,
  Download,
  Earth,
  Expand,
  Focus,
  Globe2,
  Layers3,
  MapPin,
  Maximize2,
  Minus,
  Moon,
  Orbit,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Telescope,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  HorizonVisualization,
  VisibilityTimeline,
} from "@/components/mission-charts";
import {
  activeAt,
  analyze,
  defaults,
  periodHours,
  sites,
  timestamp,
  type Analysis,
  type Requirements,
  type SiteId,
  type Window,
} from "@/lib/mission";
import type { CameraAction, Layers } from "@/components/moon-globe";
const MoonGlobe = dynamic(() => import("@/components/moon-globe"), {
  ssr: false,
  loading: () => (
    <div className="scene-loading">
      <Orbit className="spin" size={30} />
      <span>Preparing lunar surface…</span>
    </div>
  ),
});
type View =
  "Explorer" | "Site Comparison" | "Mission Windows" | "Mission Brief";
const views: View[] = [
  "Explorer",
  "Site Comparison",
  "Mission Windows",
  "Mission Brief",
];
function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-symbol">
        <Orbit size={28} strokeWidth={1.3} />
      </span>
      <span>
        LUNAR
        <span className="brand-sub">
          {compact ? "MISSION CONTROL" : "MISSION NAVIGATOR"}
        </span>
      </span>
    </span>
  );
}
function DemoNotice() {
  return (
    <span className="demo-badge">
      <span /> DEMO MODE
    </span>
  );
}
function Ring({ value, color }: { value: number; color: string }) {
  return (
    <svg className="progress-ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="#202b3b"
        strokeWidth="3"
      />
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={`${value * 1.257} 125.7`}
        strokeLinecap="round"
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}
function RequirementSliders({
  requirements,
  onChange,
}: {
  requirements: Requirements;
  onChange: (r: Requirements) => void;
}) {
  return (
    <div className="requirement-sliders">
      {(
        [
          [
            "sunlight",
            "Minimum continuous sunlight",
            1,
            24,
            "The minimum uninterrupted sunlit time within a qualifying window.",
          ],
          [
            "blackout",
            "Maximum communication blackout",
            0,
            24,
            "The longest permitted interruption of direct Earth visibility.",
          ],
          [
            "duration",
            "Required mission duration",
            1,
            48,
            "The minimum length of a qualifying operating window.",
          ],
        ] as const
      ).map(([key, label, min, max, help]) => (
        <div className="requirement" key={key}>
          <label htmlFor={`req-${key}`}>
            <span title={help}>{label}</span>
            <b>
              {requirements[key]}
              <small> h</small>
            </b>
          </label>
          <input
            id={`req-${key}`}
            aria-description={help}
            type="range"
            min={min}
            max={max}
            value={requirements[key]}
            style={
              {
                "--range-progress": `${((requirements[key] - min) / (max - min)) * 100}%`,
              } as React.CSSProperties
            }
            onChange={(e) =>
              onChange({ ...requirements, [key]: Number(e.target.value) })
            }
          />
          <div className="range-ends">
            <span>{min}h</span>
            <span>{max}h</span>
          </div>
        </div>
      ))}
    </div>
  );
}
export default function MissionApp() {
  const [launched, setLaunched] = useState(false),
    [view, setView] = useState<View>("Explorer");
  const [selected, setSelected] = useState<SiteId>("shackleton"),
    [candidateA, setCandidateA] = useState<SiteId>("shackleton");
  const candidateB: SiteId =
    candidateA === "shackleton" ? "malapert" : "shackleton";
  const [start, setStart] = useState("2026-11-07"),
    [end, setEnd] = useState("2026-11-13");
  const [requirements, setRequirements] = useState<Requirements>(defaults);
  const [hour, setHour] = useState(18),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(1);
  const [selectedWindow, setSelectedWindow] = useState<string>();
  const [layers, setLayers] = useState<Layers>({
    terrain: true,
    sites: true,
    sunlight: false,
    earth: false,
    elevation: false,
  });
  const [layerMenu, setLayerMenu] = useState(false),
    [mobileControls, setMobileControls] = useState(false);
  const [modal, setModal] = useState<"help" | "settings" | "onboarding" | null>(
      null,
    ),
    [onboardStep, setOnboardStep] = useState(0);
  const [lowQuality, setLowQuality] = useState(false),
    [reduceMotion, setReduceMotion] = useState(false);
  const systemReduced = useReducedMotion();
  const reduced = reduceMotion || !!systemReduced;
  const [camera, setCamera] = useState<CameraAction>({ type: "reset", seq: 0 });
  const [analysisStage, setAnalysisStage] = useState(-1),
    [notice, setNotice] = useState("");
  const explorerRef = useRef<HTMLDivElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const results = useMemo(
    () => ({
      shackleton: analyze("shackleton", start, end, requirements),
      malapert: analyze("malapert", start, end, requirements),
    }),
    [start, end, requirements],
  );
  const result = results[selected],
    site = sites[selected];
  const dateValid = periodHours(start, end) > 0;
  const currentWindow = result.windows.find((w) => w.id === selectedWindow);
  const changeCamera = (type: CameraAction["type"]) =>
    setCamera((prev) => ({ type, seq: prev.seq + 1 }));
  const selectSite = (id: SiteId) => {
    setSelected(id);
    setSelectedWindow(undefined);
    changeCamera("site");
  };
  const updateRequirements = (next: Requirements) => {
    setRequirements(next);
    setSelectedWindow(undefined);
    setNotice("Scenario updated.");
  };
  const pickWindow = (w: Window) => {
    setSelectedWindow(w.id);
    setHour(w.start);
    setPlaying(false);
    setNotice("Operating window selected.");
  };
  const launch = () => {
    setLaunched(true);
    window.scrollTo(0, 0);
    try {
      if (!localStorage.getItem("lunar-onboarded")) setModal("onboarding");
    } catch {
      setModal("onboarding");
    }
  };
  const closeOnboarding = () => {
    setModal(null);
    try {
      localStorage.setItem("lunar-onboarded", "1");
    } catch {
      /* Storage is optional for the walkthrough. */
    }
  };
  const navigate = (next: View) => {
    setView(next);
    setPlaying(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2400);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    setHour((h) => Math.min(h, Math.max(0, result.hours - 1)));
    setSelectedWindow(undefined);
    setPlaying(false);
  }, [start, end, result.hours]);
  useEffect(() => {
    if (!playing || !dateValid) return;
    const t = setInterval(
      () => setHour((h) => (h + speed) % result.hours),
      700,
    );
    return () => clearInterval(t);
  }, [playing, speed, result.hours, dateValid]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (analysisStage < 0) return;
    timers.current.forEach(clearTimeout);
    setAnalysisStage(-1);
  }, [start, end, requirements, selected]); // Cancel a simulated run when its inputs change.
  const runAnalysis = () => {
    if (!dateValid || analysisStage >= 0) return;
    setAnalysisStage(0);
    setMobileControls(false);
    timers.current.forEach(clearTimeout);
    for (let i = 1; i < 4; i++)
      timers.current.push(setTimeout(() => setAnalysisStage(i), i * 420));
    timers.current.push(
      setTimeout(() => {
        setAnalysisStage(-1);
        setView("Mission Windows");
        setNotice("Demo analysis ready.");
        if (result.windows[0]) pickWindow(result.windows[0]);
      }, 1800),
    );
  };
  const controls = (
    <div className="control-panel">
      <div className="panel-heading">
        <span className="eyebrow">MISSION PARAMETERS</span>
        <h2>
          Configure mission
          <span className="tiny-dot" />
        </h2>
        <p>Define your next lunar operation.</p>
      </div>
      <div className="control-section">
        <h3>
          <MapPin size={14} /> Landing sites <span>01</span>
        </h3>
        <label className="field-label" htmlFor="candidate-a">
          CANDIDATE SITE A
        </label>
        <div className="select-wrap">
          <span className="site-letter">A</span>
          <select
            id="candidate-a"
            value={candidateA}
            onChange={(e) => {
              const id = e.target.value as SiteId;
              setCandidateA(id);
              selectSite(id);
            }}
          >
            <option value="shackleton">Shackleton Crater Rim</option>
            <option value="malapert">Malapert Massif</option>
          </select>
          <ChevronDown size={13} />
        </div>
        <label className="field-label" htmlFor="candidate-b">
          CANDIDATE SITE B
        </label>
        <div className="select-wrap">
          <span className="site-letter muted">B</span>
          <select
            id="candidate-b"
            value={candidateB}
            onChange={(e) => {
              const id = e.target.value as SiteId;
              setCandidateA(id === "shackleton" ? "malapert" : "shackleton");
              selectSite(id);
            }}
          >
            <option value="malapert">Malapert Massif</option>
            <option value="shackleton">Shackleton Crater Rim</option>
          </select>
          <ChevronDown size={13} />
        </div>
      </div>
      <div className="control-section">
        <h3>
          <Clock3 size={14} /> Mission period <span>02</span>
        </h3>
        <div className="date-grid">
          <label>
            START DATE
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              aria-label="Start date"
            />
          </label>
          <label>
            END DATE
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              aria-label="End date"
            />
          </label>
        </div>
        <div className="presets">
          {[7, 14, 30].map((days) => (
            <button
              key={days}
              className={result.hours === days * 24 ? "active" : ""}
              onClick={() => {
                const base = Date.parse(start + "T00:00:00Z");
                if (!Number.isNaN(base))
                  setEnd(
                    new Date(base + (days - 1) * 86400000)
                      .toISOString()
                      .slice(0, 10),
                  );
              }}
            >
              {days} days
            </button>
          ))}
        </div>
        {!dateValid && (
          <p className="field-error" role="alert">
            Choose an end date on or after the start, within 31 days.
          </p>
        )}
      </div>
      <div className="control-section">
        <h3>
          <SlidersHorizontal size={14} /> Mission requirements <span>03</span>
        </h3>
        <RequirementSliders
          requirements={requirements}
          onChange={updateRequirements}
        />
      </div>
      <Button
        className="analyze-button"
        onClick={runAnalysis}
        disabled={!dateValid || analysisStage >= 0}
      >
        <Orbit size={16} className={analysisStage >= 0 ? "spin" : ""} />
        {analysisStage >= 0
          ? "Simulating scenario…"
          : "Analyze Mission Windows"}
        <ArrowRight size={15} />
      </Button>
      <p className="control-footnote">
        <ShieldCheck size={12} /> Illustrative frontend simulation
      </p>
    </div>
  );
  const playback = (
    <div className="playback">
      <div className="playback-actions">
        <button
          aria-label="Previous time step"
          onClick={() => {
            setPlaying(false);
            setHour((h) => Math.max(0, h - 1));
          }}
        >
          <SkipBack size={14} />
        </button>
        <button
          className="play-button"
          aria-label={playing ? "Pause timeline" : "Play timeline"}
          onClick={() => setPlaying(!playing)}
          disabled={!dateValid}
        >
          {playing ? (
            <Pause size={14} />
          ) : (
            <Play size={14} fill="currentColor" />
          )}
        </button>
        <button
          aria-label="Next time step"
          onClick={() => {
            setPlaying(false);
            setHour((h) => Math.min(Math.max(0, result.hours - 1), h + 1));
          }}
        >
          <SkipForward size={14} />
        </button>
      </div>
      <div className="playback-date">
        <span>{timestamp(start, hour)}</span>
        <small>UTC · SIMULATED TIME</small>
      </div>
      <input
        aria-label="Mission time"
        type="range"
        min={0}
        max={Math.max(1, result.hours - 1)}
        step={1}
        value={hour}
        onChange={(e) => {
          setHour(Number(e.target.value));
          setPlaying(false);
        }}
      />
      <button
        className="speed-button"
        aria-label={`Playback speed ${speed} times. Change speed`}
        onClick={() => setSpeed((s) => (s === 4 ? 1 : s * 2))}
      >
        {speed}×
      </button>
      <button
        aria-label="Reset timeline"
        onClick={() => {
          setHour(0);
          setPlaying(false);
        }}
      >
        <RotateCcw size={14} />
      </button>
    </div>
  );
  return (
    <div className={reduced ? "app reduced-motion" : "app"}>
      {!launched ? (
        <>
          <header className="landing-nav">
            <Logo />
            <div className="landing-nav-right">
              <span className="challenge-label">
                NASA SPACE APPS CHALLENGE 2026
              </span>
              <Button variant="outline" size="sm" onClick={launch}>
                Mission control <ArrowUpRight size={15} />
              </Button>
            </div>
          </header>
          <main className="landing-main">
            <section className="hero">
              <div className="starfield" />
              <div className="hero-orbit orbit-one" />
              <div className="hero-orbit orbit-two" />
              <div className="hero-globe">
                <MoonGlobe hero reduced={reduced} />
              </div>
              <motion.div
                className="hero-content"
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: reduced ? 0 : 0.9, delay: 0.2 }}
              >
                <div className="hero-eyebrow">
                  <span className="status-dot" /> A NEW PERSPECTIVE ON LUNAR
                  EXPLORATION
                </div>
                <h1>
                  Every mission
                  <br />
                  begins with the
                  <br />
                  <span>right window.</span>
                </h1>
                <p>
                  Explore the lunar south pole. Understand the conditions.
                  <br className="desktop-only" /> Discover when sunlight and
                  Earth visibility align.
                </p>
                <div className="hero-buttons">
                  <Button onClick={launch}>
                    Launch Mission Explorer <ArrowUpRight size={18} />
                  </Button>
                  <button
                    className="text-button"
                    onClick={() =>
                      document
                        .getElementById("how-it-works")
                        ?.scrollIntoView({
                          behavior: reduced ? "instant" : "smooth",
                        })
                    }
                  >
                    Discover how it works <ArrowDown size={15} />
                  </button>
                </div>
                <div className="hero-tags">
                  <span>
                    <Crosshair size={13} /> Lunar south pole
                  </span>
                  <span>
                    <Sun size={14} /> Solar visibility
                  </span>
                  <span>
                    <Radio size={14} /> Earth communication
                  </span>
                </div>
              </motion.div>
              <div className="hero-coordinate">
                <span className="coordinate-line" />
                <span>
                  89.90° S / 0.00° E<small>SHACKLETON CRATER RIM</small>
                </span>
                <span className="coordinate-dot" />
              </div>
              <div className="hero-side-label">
                THE NEXT CHAPTER OF EXPLORATION
              </div>
              <div className="hero-footer">
                <span>01 / EXPLORE THE POSSIBILITIES</span>
                <span>
                  ILLUSTRATIVE MISSION PLANNING <span className="status-dot" />
                </span>
              </div>
            </section>
            <section className="discovery" id="how-it-works">
              <div className="discovery-heading">
                <span className="eyebrow">A CLEARER PATH TO THE MOON</span>
                <h2>One mission. Every condition, connected.</h2>
                <p>
                  From the first point on the map to the right moment to begin.
                </p>
              </div>
              <div className="discovery-grid">
                {[
                  {
                    icon: Telescope,
                    title: "Explore the terrain",
                    body: "Navigate the lunar south pole and discover two distinct candidate locations.",
                    num: "01",
                  },
                  {
                    icon: Sun,
                    title: "Understand the conditions",
                    body: "See sunlight, Earth visibility, and local terrain come together over time.",
                    num: "02",
                  },
                  {
                    icon: Orbit,
                    title: "Find your window",
                    body: "Set your mission requirements. Compare the moments when conditions align.",
                    num: "03",
                  },
                ].map((item) => (
                  <div className="discovery-item" key={item.num}>
                    <div>
                      <item.icon size={24} />
                      <span>{item.num}</span>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.body}</p>
                  </div>
                ))}
              </div>
              <div className="discovery-end">
                <span>
                  <i className="status-dot" /> Built for curiosity. Designed for
                  exploration.
                </span>
                <Button variant="outline" onClick={launch}>
                  Enter mission control <ArrowRight size={16} />
                </Button>
              </div>
            </section>
          </main>
          <footer className="landing-footer">
            <Logo />
            <span>
              Independent Space Apps concept · Demonstration data only
            </span>
            <a
              href="https://svs.gsfc.nasa.gov/4720/"
              target="_blank"
              rel="noreferrer"
            >
              Lunar imagery: NASA SVS <ArrowUpRight size={12} />
            </a>
          </footer>
        </>
      ) : (
        <>
          <header className="app-nav">
            <button
              className="brand-button"
              onClick={() => {
                setLaunched(false);
                setPlaying(false);
              }}
              aria-label="Return to landing page"
            >
              <Logo compact />
            </button>
            <nav aria-label="Mission sections">
              {views.map((v) => (
                <button
                  key={v}
                  onClick={() => navigate(v)}
                  aria-current={view === v ? "page" : undefined}
                  className={view === v ? "active" : ""}
                >
                  {v}
                </button>
              ))}
            </nav>
            <div className="nav-tools">
              <DemoNotice />
              <button
                aria-label="Help and data sources"
                onClick={() => setModal("help")}
              >
                <CircleHelp size={17} />
              </button>
              <button
                aria-label="Display settings"
                onClick={() => setModal("settings")}
              >
                <Settings2 size={17} />
              </button>
              <span className="mission-avatar">
                <Orbit size={18} />
              </span>
            </div>
          </header>
          <div className="workspace-title">
            <div>
              <span className="eyebrow">
                LUNAR SOUTH POLE <ChevronRight size={10} /> MISSION PLANNING
              </span>
              <h1>
                {view === "Explorer"
                  ? "A new frontier. A clearer perspective."
                  : view === "Site Comparison"
                    ? "Two locations. Different possibilities."
                    : view === "Mission Windows"
                      ? "Find your mission window."
                      : "Your next mission, at a glance."}
              </h1>
            </div>
            <div className="workspace-title-right">
              <span className="mission-id">MISSION / LM–026</span>
              <button
                className="mobile-config button button-outline"
                onClick={() => setMobileControls(true)}
              >
                <SlidersHorizontal size={14} /> Configure
              </button>
              <span className="live-status">
                <i className="status-dot green" /> SIMULATION READY
              </span>
            </div>
          </div>
          <div className="workspace">
            <aside className="desktop-controls">
              {!mobileControls && controls}
            </aside>
            <main
              className={`mission-content ${view === "Explorer" ? "explorer-content" : ""}`}
            >
              {view === "Explorer" ? (
                <>
                  <div className="explorer-grid">
                    <div
                      className="globe-panel"
                      ref={explorerRef}
                      tabIndex={0}
                      aria-label="Interactive lunar explorer. R resets camera, Space plays timeline."
                      onKeyDown={(e) => {
                        if (
                          e.target instanceof HTMLElement &&
                          e.target.matches("input, select, textarea, button")
                        )
                          return;
                        if (e.key.toLowerCase() === "r") {
                          e.preventDefault();
                          changeCamera("reset");
                        }
                        if (e.code === "Space") {
                          e.preventDefault();
                          setPlaying((p) => !p);
                        }
                      }}
                    >
                      <div className="starfield" />
                      <div className="globe-panel-top">
                        <div>
                          <span className="eyebrow">LUNAR EXPLORER</span>
                          <span className="scene-subtitle">
                            South polar region <span> / </span> 3D view
                          </span>
                        </div>
                        <span className="scene-badge">
                          <span /> {lowQuality ? "STATIC VIEW" : "LIVE VIEW"}
                        </span>
                      </div>
                      <div className="globe-stage">
                        <MoonGlobe
                          selected={selected}
                          onSelect={selectSite}
                          layers={layers}
                          hour={hour}
                          action={camera}
                          reduced={reduced}
                          lowQuality={lowQuality}
                        />
                      </div>
                      <div className="globe-grid-orbit" />
                      <div className="globe-coordinates">
                        <span>90° S</span>
                        <span>0° E</span>
                      </div>
                      <div className="globe-tools">
                        <button
                          aria-label="Zoom in"
                          disabled={lowQuality}
                          onClick={() => changeCamera("in")}
                        >
                          <Plus size={16} />
                        </button>
                        <button
                          aria-label="Zoom out"
                          disabled={lowQuality}
                          onClick={() => changeCamera("out")}
                        >
                          <Minus size={16} />
                        </button>
                        <span />
                        <button
                          aria-label="Reset camera"
                          disabled={lowQuality}
                          onClick={() => changeCamera("reset")}
                        >
                          <RotateCcw size={15} />
                        </button>
                        <button
                          aria-label="Toggle explorer fullscreen"
                          onClick={() => {
                            if (document.fullscreenElement)
                              void document.exitFullscreen();
                            else
                              void explorerRef.current
                                ?.requestFullscreen()
                                .catch(() =>
                                  setNotice(
                                    "Fullscreen is unavailable in this preview.",
                                  ),
                                );
                          }}
                        >
                          <Maximize2 size={15} />
                        </button>
                      </div>
                      <div className="globe-bottom">
                        <button
                          className="focus-button"
                          disabled={lowQuality}
                          onClick={() => changeCamera("south")}
                        >
                          <Focus size={15} /> Focus south pole
                        </button>
                        <div className="layer-control">
                          <button
                            className={layerMenu ? "active" : ""}
                            onClick={() => setLayerMenu(!layerMenu)}
                            aria-expanded={layerMenu}
                          >
                            <Layers3 size={15} /> Layers{" "}
                            <ChevronDown size={12} />
                          </button>
                          {layerMenu && (
                            <div className="layer-menu">
                              <span className="eyebrow">
                                ILLUSTRATIVE OVERLAYS
                              </span>
                              {(
                                [
                                  ["terrain", "Lunar terrain"],
                                  ["sites", "Mission sites"],
                                  ["sunlight", "Sunlight"],
                                  ["earth", "Earth visibility"],
                                  ["elevation", "Elevation grid"],
                                ] as const
                              ).map(([key, label]) => (
                                <label key={key}>
                                  <span>{label}</span>
                                  <input
                                    type="checkbox"
                                    checked={layers[key]}
                                    onChange={(e) =>
                                      setLayers({
                                        ...layers,
                                        [key]: e.target.checked,
                                      })
                                    }
                                  />
                                </label>
                              ))}
                              <small>
                                Coverage is illustrative, not calculated.
                              </small>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="globe-instructions">
                        {lowQuality
                          ? "Static fallback · select sites in mission controls"
                          : "Drag to orbit · Scroll to zoom · Markers are schematic"}
                        <span className="compass">
                          N <span>↑</span>
                        </span>
                      </div>
                    </div>
                    <aside className="insights">
                      <div className="insights-heading">
                        <h2>Mission insights</h2>
                        <span className="small-live-dot" />
                      </div>
                      <span className="data-label">ILLUSTRATIVE DEMO DATA</span>
                      <div className="insight-site">
                        <span className="eyebrow">SELECTED LOCATION</span>
                        <h3>{site.name}</h3>
                        <span className="mono">
                          <MapPin size={12} />
                          {site.coordinates}
                        </span>
                        <p>
                          {timestamp(start, 0, true)} —{" "}
                          {timestamp(end, 0, true)} {end.slice(0, 4)}
                        </p>
                      </div>
                      <div className="metric">
                        <div>
                          <span>
                            <Sun size={14} /> Sunlight availability
                          </span>
                          <strong>
                            {result.sunlight}
                            <small>%</small>
                          </strong>
                          <p className="amber-text">
                            {activeAt(result.solar, hour)
                              ? "● Currently illuminated"
                              : "○ Currently in shadow"}
                          </p>
                        </div>
                        <Ring value={result.sunlight} color="#ffc66d" />
                      </div>
                      <div className="metric">
                        <div>
                          <span>
                            <Earth size={14} /> Earth visibility
                          </span>
                          <strong>
                            {result.earthVisibility}
                            <small>%</small>
                          </strong>
                          <p className="blue-text">
                            {activeAt(result.earth, hour)
                              ? "● Direct link available"
                              : "○ Communication blackout"}
                          </p>
                        </div>
                        <Ring value={result.earthVisibility} color="#4a9eff" />
                      </div>
                      <div className="longest-window">
                        <span>
                          <Clock3 size={14} /> Longest qualifying window
                        </span>
                        <strong>
                          {result.longest}
                          <small> hours</small>
                        </strong>
                        <div className="mini-bars">
                          {[
                            25, 35, 50, 45, 67, 83, 65, 95, 75, 100, 82, 60, 75,
                            96, 65, 45, 60, 80, 60, 35,
                          ].map((v, i) => (
                            <i
                              key={i}
                              style={{ height: `${result.longest ? v : 4}%` }}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="limiting">
                        <span>
                          <CircleHelp size={13} /> MAIN LIMITING CONDITION
                        </span>
                        <p>{site.constraint}</p>
                      </div>
                      <button
                        className="compare-link"
                        onClick={() => navigate("Site Comparison")}
                      >
                        Compare with{" "}
                        {
                          sites[
                            selected === "shackleton"
                              ? "malapert"
                              : "shackleton"
                          ].short
                        }
                        <ArrowUpRight size={15} />
                      </button>
                    </aside>
                  </div>
                  <section className="timeline-panel">
                    <div className="section-heading">
                      <div>
                        <span className="eyebrow">
                          THE RIGHT CONDITIONS. AT THE RIGHT TIME.
                        </span>
                        <h2>
                          Mission timeline{" "}
                          <span className="count-badge">
                            {result.windows.length} windows
                          </span>
                        </h2>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => navigate("Mission Windows")}
                      >
                        Explore windows <ArrowUpRight size={14} />
                      </button>
                    </div>
                    <VisibilityTimeline
                      data={result}
                      start={start}
                      hour={hour}
                      selected={selectedWindow}
                      onSelect={pickWindow}
                      onSeek={setHour}
                    />
                    {playback}
                  </section>
                </>
              ) : view === "Site Comparison" ? (
                <div className="detail-page">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">SIDE BY SIDE</span>
                      <h2>Every location has a different horizon.</h2>
                      <p>
                        Compare your candidates under the same mission
                        requirements.
                      </p>
                    </div>
                    <span className="data-label">SIMULATED RESULTS</span>
                  </div>
                  <div className="comparison-grid">
                    {[candidateA, candidateB].map((id, index) => (
                      <article
                        key={id}
                        className={`comparison-card ${selected === id ? "selected" : ""}`}
                      >
                        <div className={`terrain-preview terrain-${id}`}>
                          <span className="site-letter">
                            {index ? "B" : "A"}
                          </span>
                          <span className="terrain-caption">
                            ILLUSTRATIVE SURFACE
                          </span>
                          <div className="terrain-pin">
                            <MapPin size={22} />
                          </div>
                        </div>
                        <div className="comparison-card-body">
                          <span className="eyebrow">
                            CANDIDATE SITE {index ? "B" : "A"}
                          </span>
                          <h3>{sites[id].name}</h3>
                          <span className="mono">{sites[id].coordinates}</span>
                          <p>{sites[id].description}</p>
                          <div className="comparison-bar">
                            <span>
                              <Sun size={14} /> Sunlight availability{" "}
                              <b>{results[id].sunlight}%</b>
                            </span>
                            <div>
                              <i
                                style={{ width: `${results[id].sunlight}%` }}
                              />
                            </div>
                          </div>
                          <div className="comparison-bar earth-bar">
                            <span>
                              <Globe2 size={14} /> Earth visibility{" "}
                              <b>{results[id].earthVisibility}%</b>
                            </span>
                            <div>
                              <i
                                style={{
                                  width: `${results[id].earthVisibility}%`,
                                }}
                              />
                            </div>
                          </div>
                          <div className="comparison-stats">
                            <div>
                              <span>Longest qualifying window</span>
                              <b>
                                {results[id].longest}
                                <small> h</small>
                              </b>
                            </div>
                            <div>
                              <span>Qualifying windows</span>
                              <b>{results[id].windows.length}</b>
                            </div>
                          </div>
                          <p className="constraint">
                            <CircleHelp size={13} />
                            {sites[id].constraint}
                          </p>
                          <Button
                            variant={selected === id ? "default" : "outline"}
                            onClick={() => selectSite(id)}
                          >
                            {selected === id ? (
                              <Check size={15} />
                            ) : (
                              <Crosshair size={15} />
                            )}{" "}
                            {selected === id
                              ? "Selected location"
                              : "Select location"}
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                  <section className="comparison-summary">
                    <Sparkles size={24} />
                    <div>
                      <span className="eyebrow">
                        MISSION COMPARISON SUMMARY
                      </span>
                      <h3>
                        {results.shackleton.longest === results.malapert.longest
                          ? results.shackleton.longest
                            ? "Both sites offer the same longest interval."
                            : "No candidates meet these requirements."
                          : `${sites[results.shackleton.longest > results.malapert.longest ? "shackleton" : "malapert"].short} offers the longer qualifying interval.`}
                      </h3>
                      <p>
                        With {requirements.sunlight}h of continuous sunlight, a
                        maximum {requirements.blackout}h blackout, and a{" "}
                        {requirements.duration}h mission,{" "}
                        {sites[candidateA].short} offers{" "}
                        {results[candidateA].windows.length} windows and{" "}
                        {sites[candidateB].short} offers{" "}
                        {results[candidateB].windows.length}. These outcomes
                        follow the predefined demo schedule, not a scientific
                        prediction.
                      </p>
                    </div>
                  </section>
                  <Button
                    variant="outline"
                    onClick={() => navigate("Mission Windows")}
                  >
                    Explore operating windows <ArrowRight size={16} />
                  </Button>
                </div>
              ) : view === "Mission Windows" ? (
                <div className="detail-page windows-page">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">
                        {site.short.toUpperCase()} / OPERATING OPPORTUNITIES
                      </span>
                      <h2>When the conditions align.</h2>
                      <p>
                        Click a green interval to explore its mission
                        conditions.
                      </p>
                    </div>
                    <select
                      aria-label="Window site"
                      value={selected}
                      onChange={(e) => selectSite(e.target.value as SiteId)}
                    >
                      {Object.values(sites).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.short}
                        </option>
                      ))}
                    </select>
                  </div>
                  <VisibilityTimeline
                    data={result}
                    start={start}
                    hour={hour}
                    selected={selectedWindow}
                    onSelect={pickWindow}
                    onSeek={setHour}
                    expanded
                  />
                  {playback}
                  {result.windows.length ? (
                    <div className="window-details">
                      <div className="window-list">
                        {result.windows.map((w, i) => (
                          <button
                            key={w.id}
                            className={selectedWindow === w.id ? "active" : ""}
                            onClick={() => pickWindow(w)}
                          >
                            <span className="window-number">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <span>
                              <b>{timestamp(start, w.start)}</b>
                              <small>{timestamp(start, w.end)} UTC</small>
                            </span>
                            <strong>{w.end - w.start}h</strong>
                            <ChevronRight size={14} />
                          </button>
                        ))}
                      </div>
                      <div className="window-selected">
                        <span className="eyebrow">
                          {currentWindow
                            ? "SELECTED OPERATING WINDOW"
                            : "SELECT A WINDOW"}
                        </span>
                        <h3>
                          {currentWindow
                            ? `${timestamp(start, currentWindow.start)} UTC`
                            : "Your next opportunity awaits."}
                        </h3>
                        <p>
                          {currentWindow
                            ? `${currentWindow.end - currentWindow.start} hours of continuous sunlight with up to ${currentWindow.blackout} hours of communication interruption.`
                            : "Choose an interval from the list to inspect its conditions and synchronize the time-travel view."}
                        </p>
                        {currentWindow && (
                          <>
                            <div className="window-checks">
                              <span>
                                <Check size={14} /> Sunlight ≥{" "}
                                {requirements.sunlight}h
                              </span>
                              <span>
                                <Check size={14} /> Blackout ≤{" "}
                                {requirements.blackout}h
                              </span>
                              <span>
                                <Check size={14} /> Duration ≥{" "}
                                {requirements.duration}h
                              </span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => navigate("Mission Brief")}
                            >
                              Create mission brief <ArrowUpRight size={14} />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">
                      <Moon size={36} />
                      <h3>No matching windows in this scenario.</h3>
                      <p>
                        Try adjusting your mission requirements or date range.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => {
                          if (window.innerWidth < 1100) setMobileControls(true);
                          else document.getElementById("req-duration")?.focus();
                        }}
                      >
                        Adjust requirements <SlidersHorizontal size={14} />
                      </Button>
                    </div>
                  )}
                  <HorizonVisualization
                    hour={hour}
                    site={selected}
                    data={result}
                  />
                  <div className="what-if-note">
                    <SlidersHorizontal size={20} />
                    <div>
                      <h3>What if the mission requirements change?</h3>
                      <p>
                        Adjust the mission controls to instantly see which
                        windows still qualify. Solar and Earth tracks remain the
                        same; qualifying intervals respond to your constraints.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (window.innerWidth < 1100) setMobileControls(true);
                        else document.getElementById("req-sunlight")?.focus();
                      }}
                    >
                      Adjust scenario
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="detail-page brief-page">
                  <div className="brief-toolbar">
                    <span className="eyebrow">
                      MISSION / LM–026 · PLANNING BRIEF
                    </span>
                    <Button variant="outline" onClick={() => window.print()}>
                      <Download size={15} /> Export Mission Brief
                    </Button>
                  </div>
                  <div className="brief-header">
                    <Orbit size={38} strokeWidth={1} />
                    <h2>Mission brief.</h2>
                    <p>A clear overview of your selected scenario.</p>
                    <span className="brief-demo">
                      DEMO DATA · NOT FOR OPERATIONAL USE
                    </span>
                  </div>
                  <div className="brief-grid">
                    <section>
                      <span className="eyebrow">01 / DESTINATION</span>
                      <h3>{site.name}</h3>
                      <p>{site.coordinates}</p>
                      <dl>
                        <dt>Candidate A</dt>
                        <dd>{sites[candidateA].name}</dd>
                        <dt>Candidate B</dt>
                        <dd>{sites[candidateB].name}</dd>
                        <dt>Mission period (UTC)</dt>
                        <dd>
                          {start} — {end}
                        </dd>
                      </dl>
                    </section>
                    <section>
                      <span className="eyebrow">02 / REQUIREMENTS</span>
                      <h3>Operating conditions</h3>
                      <dl>
                        <dt>Minimum continuous sunlight</dt>
                        <dd>{requirements.sunlight} h</dd>
                        <dt>Maximum blackout</dt>
                        <dd>{requirements.blackout} h</dd>
                        <dt>Required mission duration</dt>
                        <dd>{requirements.duration} h</dd>
                      </dl>
                    </section>
                    <section>
                      <span className="eyebrow">03 / SIMULATED VISIBILITY</span>
                      <h3>{result.windows.length} qualifying opportunities</h3>
                      <dl>
                        <dt>Sunlight availability</dt>
                        <dd>{result.sunlight}%</dd>
                        <dt>Earth visibility</dt>
                        <dd>{result.earthVisibility}%</dd>
                        <dt>Longest qualifying window</dt>
                        <dd>{result.longest} h</dd>
                      </dl>
                      <p>{site.constraint}</p>
                    </section>
                    <section>
                      <span className="eyebrow">04 / SELECTED WINDOW</span>
                      <h3>
                        {currentWindow
                          ? `${currentWindow.end - currentWindow.start} hours of opportunity`
                          : "No window selected"}
                      </h3>
                      {currentWindow ? (
                        <dl>
                          <dt>Start (UTC)</dt>
                          <dd>{timestamp(start, currentWindow.start)}</dd>
                          <dt>End (UTC)</dt>
                          <dd>{timestamp(start, currentWindow.end)}</dd>
                          <dt>Longest blackout</dt>
                          <dd>{currentWindow.blackout} h</dd>
                        </dl>
                      ) : (
                        <>
                          <p>
                            Select a qualifying interval to complete this brief.
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => navigate("Mission Windows")}
                          >
                            Choose a window <ArrowRight size={14} />
                          </Button>
                        </>
                      )}
                    </section>
                  </div>
                  <section className="brief-assumptions">
                    <h3>Assumptions & limitations</h3>
                    <p>
                      All mission values use a deterministic, repeating 72-hour
                      demo schedule. Dates shift and clip that schedule.
                      Qualifying intervals require continuous sunlight and merge
                      visible Earth intervals only when the gap is within your
                      allowed blackout. Coordinates identify approximate
                      regions; marker labels are offset for legibility.
                      Lighting, coverage overlays, elevation grid, and the local
                      horizon are illustrative.
                    </p>
                    <p>
                      This independent concept is not affiliated with or
                      endorsed by NASA. NASA LRO/LOLA, JPL Horizons, and Moon
                      Trek are intended sources for a future scientific
                      implementation; no live integration is present. Lunar
                      surface imagery:{" "}
                      <a
                        href="https://svs.gsfc.nasa.gov/4720/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        NASA’s Scientific Visualization Studio
                      </a>
                      .
                    </p>
                    <p>
                      Comparison: {sites[candidateA].short} has{" "}
                      {results[candidateA].windows.length} qualifying windows
                      (longest {results[candidateA].longest}h);{" "}
                      {sites[candidateB].short} has{" "}
                      {results[candidateB].windows.length} (longest{" "}
                      {results[candidateB].longest}h).
                    </p>
                  </section>
                </div>
              )}
            </main>
          </div>
          <footer className="app-footer">
            <span>
              <i className="status-dot" /> All mission results are simulated ·
              Independent Space Apps concept
            </span>
            <button onClick={() => setModal("help")}>
              Data sources & assumptions <ArrowUpRight size={12} />
            </button>
            <span>LUNAR MISSION NAVIGATOR / 2026</span>
          </footer>
        </>
      )}
      <Dialog
        open={modal === "onboarding"}
        onOpenChange={(open) => {
          if (!open) closeOnboarding();
        }}
        title={
          [
            "Choose your lunar locations.",
            "Define the mission.",
            "Find the right moment.",
          ][onboardStep]
        }
        description={
          [
            "Compare Shackleton Crater Rim and Malapert Massif. Select a map marker or use the mission controls.",
            "Choose a date range, sunlight requirement, communication tolerance, and mission duration.",
            "Run the illustrative analysis, choose an operating window, and export your mission brief.",
          ][onboardStep]
        }
      >
        <div className="onboarding-art">
          {onboardStep === 0 ? (
            <MapPin size={60} strokeWidth={1} />
          ) : onboardStep === 1 ? (
            <SlidersHorizontal size={60} strokeWidth={1} />
          ) : (
            <Orbit size={70} strokeWidth={1} />
          )}
        </div>
        <div className="onboarding-progress">
          {[0, 1, 2].map((i) => (
            <span key={i} className={i <= onboardStep ? "active" : ""} />
          ))}
        </div>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={closeOnboarding}>
            Skip guide
          </Button>
          <Button
            onClick={() =>
              onboardStep < 2
                ? setOnboardStep(onboardStep + 1)
                : closeOnboarding()
            }
          >
            {onboardStep === 2 ? "Begin exploring" : "Continue"}
            <ArrowRight size={15} />
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={modal === "help"}
        onOpenChange={(open) => !open && setModal(null)}
        title="A little mission context."
        description="Explore freely. Every mission result in this prototype is illustrative."
      >
        <div className="help-sections">
          <h3>What is direct-to-Earth visibility?</h3>
          <p>
            Earth is above the local terrain horizon, allowing a direct
            communication link. In this demo, that condition follows a
            predefined schedule.
          </p>
          <h3>How do operating windows work?</h3>
          <p>
            Windows have uninterrupted sunlight, meet your mission duration, and
            permit only communication gaps within your blackout limit. The demo
            repeats every 72 hours.
          </p>
          <h3>Imagery & future data sources</h3>
          <p>
            The globe uses{" "}
            <a
              href="https://svs.gsfc.nasa.gov/4720/"
              target="_blank"
              rel="noreferrer"
            >
              NASA SVS CGI Moon Kit
            </a>{" "}
            imagery. NASA LRO/LOLA, JPL Horizons, and Moon Trek are planned
            scientific sources; the demo is not connected to them.
          </p>
          <h3>Keyboard controls</h3>
          <p>
            <kbd>Space</kbd> Play/pause and <kbd>R</kbd> reset camera when the
            explorer is focused. <kbd>Esc</kbd> closes dialogs. All controls
            also work with Tab and Enter.
          </p>
        </div>
      </Dialog>
      <Dialog
        open={modal === "settings"}
        onOpenChange={(open) => !open && setModal(null)}
        title="Make space your own."
        description="Display preferences apply immediately to this session."
      >
        <label className="setting-row">
          <span>
            <b>Reduced motion</b>
            <small>Limit animation and automatic rotation.</small>
          </span>
          <input
            type="checkbox"
            checked={reduced}
            disabled={!!systemReduced}
            onChange={(e) => setReduceMotion(e.target.checked)}
          />
        </label>
        <label className="setting-row">
          <span>
            <b>Lightweight view</b>
            <small>Use a static globe for lower-powered devices.</small>
          </span>
          <input
            type="checkbox"
            checked={lowQuality}
            onChange={(e) => setLowQuality(e.target.checked)}
          />
        </label>
        <p className="dialog-description">
          Your device’s reduced-motion preference is respected automatically.
        </p>
      </Dialog>
      <Dialog
        open={mobileControls}
        onOpenChange={setMobileControls}
        title="Mission configuration"
        description="Your settings stay synchronized across every view."
        className="mobile-sheet"
      >
        {controls}
      </Dialog>
      <AnimatePresence>
        {notice && (
          <motion.div
            role="status"
            className="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Check size={15} />
            {notice}
          </motion.div>
        )}
      </AnimatePresence>
      {analysisStage >= 0 && (
        <div className="analysis-overlay" role="status" aria-live="polite">
          <Orbit size={44} strokeWidth={1} className={reduced ? "" : "spin"} />
          <span className="eyebrow">SIMULATED ANALYSIS</span>
          <h3>
            {
              [
                "Preparing mission scenario",
                "Evaluating demo solar intervals",
                "Evaluating demo Earth intervals",
                "Generating comparison",
              ][analysisStage]
            }
          </h3>
          <div className="analysis-steps">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={i <= analysisStage ? "active" : ""} />
            ))}
          </div>
          <p>Illustrative processing · No scientific calculation</p>
        </div>
      )}
    </div>
  );
}
