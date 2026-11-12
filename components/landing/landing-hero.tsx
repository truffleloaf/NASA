"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Earth, Sun } from "lucide-react";
import { ProvenanceBadge } from "../ui/provenance-badge";
import Galaxy from "./galaxy";
import { useAtmosphere } from "./use-atmosphere";
import { MoonFallback as StaticMoon } from "./moon-fallback";
const MoonHero = dynamic(() => import("./moon-hero"), { ssr: false, loading: () => <StaticMoon /> });
const ease = [0.2, 0, 0, 1] as const;
export function LandingHero({ onExplore, onCompare }: { onExplore: () => void; onCompare: () => void }) {
  const host = useRef<HTMLElement>(null),
    atmosphere = useAtmosphere(host),
    reduced = useReducedMotion();
  const [loadMoon, setLoadMoon] = useState(false);
  useEffect(() => {
    if (atmosphere.saveData || !atmosphere.active || loadMoon) return;
    let idle = 0;
    const timer = setTimeout(() => {
      if ("requestIdleCallback" in window)
        idle = window.requestIdleCallback(() => setLoadMoon(true), { timeout: 1500 });
      else setLoadMoon(true);
    }, 700);
    return () => {
      clearTimeout(timer);
      if (idle) window.cancelIdleCallback(idle);
    };
  }, [atmosphere.active, atmosphere.saveData, loadMoon]);
  return (
    <section ref={host} className="landing-hero" data-atmosphere-running={atmosphere.active && !atmosphere.reduced}>
      <motion.div
        className="galaxy-entrance"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.6, ease }}
      >
        <Galaxy host={host} atmosphere={atmosphere} />
      </motion.div>
      <div className="hero-copy">
        <span className="mono-caps">
          <i className="status-dot" />A clearer view of the lunar south pole
        </span>
        <h1>
          {["Find the hours", "when the Moon", "lets you work."].map((line, i) => (
            <motion.span
              className="hero-headline-line"
              key={line}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.08 * i, ease }}
            >
              {line}
            </motion.span>
          ))}
        </h1>
        <p>
          Sunlight for power. Earth in sight for connection.
          <br className="desktop-only" /> Discover where both align, and plan around the terrain.
        </p>
        <div className="button-row">
          <button className="action-primary" onClick={onExplore}>
            Open the explorer
            <ArrowRight />
          </button>
          <button className="action-outline" onClick={onCompare}>
            Compare sites
          </button>
        </div>
        <div className="hero-foot">
          <ProvenanceBadge
            kind="Estimated"
            detail="JPL DE441 directions and LRO LOLA elevations are Computed; terrain horizons, visibility and windows are Estimated."
          />
          <span>Real source data. Explicit uncertainty.</span>
        </div>
      </div>
      <div
        className="moon-composition"
        role="img"
        aria-label="Illustrative lunar south pole. The Shackleton region marker connects to a blue Earth disc; an amber marker indicates the Sun's direction. Decorative positions are not mission results."
      >
        <motion.div
          className="hero-moon-frame"
          aria-hidden="true"
          initial={reduced ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.12, ease }}
        >
          {loadMoon && !atmosphere.saveData ? <MoonHero atmosphere={atmosphere} /> : <StaticMoon />}
        </motion.div>
      </div>
      <motion.div
        className="moon-callout"
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.36, ease }}
      >
        <span className="mono-caps">The right place. The right time.</span>
        <p>
          <Sun />
          Sun above the terrain
        </p>
        <p>
          <Earth />
          Earth above the horizon
        </p>
        <span className="small muted">Choose a site to calculate a window.</span>
        <ProvenanceBadge
          kind="Illustrative"
          detail="Decorative Moon, Sun and Earth composition; use the explorer for computed terrain and estimated visibility."
        />
      </motion.div>
    </section>
  );
}
