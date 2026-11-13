"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { ArrowRight, Earth, Sun } from "lucide-react";
import { ProvenanceBadge } from "../ui/provenance-badge";
import { useAtmosphere } from "./use-atmosphere";
import { MoonFallback as StaticMoon } from "./moon-fallback";
const MoonHero = dynamic(() => import("./moon-hero"), { ssr: false, loading: () => <StaticMoon /> });
const ease = [0.2, 0, 0, 1] as const;
export function LandingHero({ onExplore, onCompare }: { onExplore: () => void; onCompare: () => void }) {
  const host = useRef<HTMLElement>(null),
    atmosphere = useAtmosphere(host),
    reduced = useReducedMotion();
  const [loadMoon, setLoadMoon] = useState(false), [diving, setDiving] = useState(false);
  const { scrollYProgress } = useScroll({ target: host, offset: ["start start", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], [0, 48]);
  useEffect(() => { if (!diving) return; const timer = setTimeout(onExplore, 800); return () => clearTimeout(timer); }, [diving, onExplore]);
  const explore = () => reduced || !loadMoon || atmosphere.saveData ? onExplore() : setDiving(true);
  useEffect(() => {
    if (atmosphere.reduced || atmosphere.saveData || !atmosphere.active || loadMoon) return;
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
  }, [atmosphere.active, atmosphere.saveData, atmosphere.reduced, loadMoon]);
  return (
    <section ref={host} className="landing-hero" data-atmosphere-running={atmosphere.active && !atmosphere.reduced}>
      <motion.div
        className="galaxy-entrance"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.6, ease }}
      >
        <div className="galaxy-fallback" aria-hidden="true" />
      </motion.div>
      <div className="hero-copy">
        <span className="mono-caps">
          <i className="status-dot" />Mission planning, illuminated.
        </span>
        <h1>
          {["Find your", "window on", "the Moon."].map((line, i) => (
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
          Explore where sunlight and Earth visibility overlap.
        </p>
        <div className="button-row">
          <button className="action-primary" onClick={explore} disabled={diving}>
            {diving ? "Approaching the south pole…" : "Open the explorer"}
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
          <span>NASA data. Transparent estimates.</span>
        </div>
      </div>
      <div
        className="moon-composition"
        role="img"
        aria-label="Illustrative lunar south pole. The Shackleton region marker connects to a blue Earth disc; an amber marker indicates the Sun's direction. Decorative positions are not mission results."
      >
        <motion.div
          className="hero-moon-frame"
          style={{ y: reduced ? 0 : drift }}
          aria-hidden="true"
          initial={reduced ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.12, ease }}
        >
          {loadMoon && !atmosphere.saveData && !atmosphere.reduced ? <MoonHero atmosphere={atmosphere} diving={diving} /> : <StaticMoon />}
        </motion.div>
      </div>
      <motion.div
        className="moon-callout"
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduced ? 0 : 0.6, delay: reduced ? 0 : 0.36, ease }}
      >
        <span className="mono-caps">Two conditions. One window.</span>
        <p>
          <Sun />
          Sunlight for power
        </p>
        <p>
          <Earth />
          Earth in sight for connection
        </p>
        <ProvenanceBadge
          kind="Illustrative"
          detail="Decorative composition and compressed 30-second libration (±7° longitude, ±6.7° latitude). Not a time-accurate view; use the explorer for computed directions and estimated visibility."
        />
      </motion.div>
    </section>
  );
}
