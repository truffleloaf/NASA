"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import manifest from "@/public/data/manifest.json";
import {
  analyzeSite,
  dateMs,
  HOUR,
  hoursInPeriod,
  sampleAt,
  validSiteData,
  type MissionConfig,
  type Site,
  type SiteData,
  type SiteId,
} from "@/lib/science";
import { encodeConfig, windowsCSV } from "@/lib/share";
import { START_CONFIG, restoreSettings } from "@/lib/planning";
import { verifyBundledAsset } from "@/lib/verified-data";
export const SITES = manifest.sites as Site[];
export const siteKindLabel = (kind: Site["kind"]) => kind === "artemis-candidate" ? "Artemis III candidate" : "Reference";
export type MissionState = ReturnType<typeof useMission>;
export function useMission(view: string) {
  const [config, setConfig] = useState<MissionConfig>(START_CONFIG),
    [data, setData] = useState<Partial<Record<SiteId, SiteData>>>({});
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [integrity, setIntegrity] = useState<"verified" | "unverified">("verified"),
    [message, setMessage] = useState("");
  const [expert,setExpert] = useState(false);
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(24),
    [reduced, setReduced] = useState(false);
  const [selectedWindow, setSelectedWindow] = useState<string | null>(null),
    [restored, setRestored] = useState(false);
  const notify = useCallback((value: string) => setMessage(value), []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReduced(media.matches);
      if (media.matches) setPlaying(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const restore = () => {
      if (location.hash === "#main") return;
      let saved = location.hash;
      if (!saved) { try { saved = sessionStorage.getItem("lunar-settings") || ""; } catch {} }
      if (saved) {
        const parsed = restoreSettings(saved);
        setConfig(parsed || START_CONFIG);
        if (!parsed) notify("This link has invalid or outdated settings. A valid starting window is restored.");
      }
      setRestored(true);
    };
    restore();
    window.addEventListener("hashchange", restore);
    return () => window.removeEventListener("hashchange", restore);
  }, [notify]);
  useEffect(() => {
    if (!restored || playing) return;
    const timer = setTimeout(() => {
      const hash = encodeConfig(config);
      history.replaceState(null, "", location.pathname + location.search + hash);
      try { sessionStorage.setItem("lunar-settings", hash); } catch {}
    }, 350);
    return () => clearTimeout(timer);
  }, [config, restored, playing]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 3200);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    const controller = new AbortController();
    let unverified = false;
    Promise.allSettled(
      SITES.map(async (site) => {
        for (const path of [site.ephemeris, site.horizon])
          if (!path.startsWith("/data/") || path.includes("..")) throw new Error("Invalid data asset path");
        const [ephemeris, horizon] = await Promise.all(
          [site.ephemeris, site.horizon].map(async (path) => {
            const response = await fetch(path, { signal: controller.signal });
            if (!response.ok) throw new Error(`${site.name}: data asset unavailable`);
            const bytes = await response.arrayBuffer();
            if ((await verifyBundledAsset(path, bytes)) === "unverified") unverified = true;
            return JSON.parse(new TextDecoder().decode(bytes));
          }),
        );
        const entry = { site, ephemeris, horizon } as SiteData;
        if (!validSiteData(entry)) throw new Error(`${site.name}: data failed validation`);
        return entry;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const entries: Partial<Record<SiteId, SiteData>> = {};
      const failures: string[] = [];
      results.forEach((result) => {
        if (result.status === "fulfilled") entries[result.value.site.id] = result.value;
        else failures.push(String(result.reason));
      });
      setData(entries);
      setError(failures.join(". "));
      setIntegrity(unverified ? "unverified" : "verified");
      setLoading(false);
    });
    return () => controller.abort();
  }, []);
  const results = useMemo(
    () =>
      Object.fromEntries(SITES.map((site) => [site.id, analyzeSite(data[site.id], config)])) as Record<
        SiteId,
        ReturnType<typeof analyzeSite>
      >,
    [data, config.site, config.start, config.end, config.sunlight, config.blackout, config.duration, config.mast],
  );
  const result = results[config.site],
    selected = SITES.find((site) => site.id === config.site)!,
    siteData = data[config.site];
  const sample = useMemo(
    () => sampleAt(siteData, dateMs(config.start) + config.hour * HOUR, config.mast),
    [siteData, config.start, config.hour, config.mast],
  );
  const period = hoursInPeriod(config.start, config.end);
  const update = useCallback((patch: Partial<MissionConfig>) => {
    setConfig((previous) => {
      const next = { ...previous, ...patch };
      next.hour = Math.min(Math.max(0, next.hour), Math.max(0, hoursInPeriod(next.start, next.end) - 1));
      return next;
    });
    setSelectedWindow(null);
    setPlaying(false);
  }, []);
  const seek = useCallback((hour: number) => {
    setConfig((previous) => ({
      ...previous,
      hour: Math.max(0, Math.min(hour, Math.max(0, hoursInPeriod(previous.start, previous.end) - 1))),
    }));
  }, []);
  useEffect(() => {
    if (!playing || reduced || !period) return;
    let frame = 0,
      last = 0,
      elapsed = 0;
    const tick = (time: number) => {
      if (last) elapsed += (Math.min(time - last, 250) * speed) / 1000;
      last = time;
      if (elapsed >= 1) {
        const steps = Math.floor(elapsed);
        elapsed -= steps;
        setConfig((previous) => ({ ...previous, hour: (previous.hour + steps) % period }));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, reduced, period]);
  useEffect(() => {
    if (view !== "explorer") { setPlaying(false); return; }
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input,textarea,select,button,a,[role="dialog"],[contenteditable="true"]')) return;
      if (event.code === "Space") {
        event.preventDefault();
        if (!reduced) setPlaying((v) => !v);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        setPlaying(false);
        setConfig((previous) => ({
          ...previous,
          hour: Math.max(
            0,
            Math.min(period - 1, previous.hour + (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 24 : 1)),
          ),
        }));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [period, reduced, view]);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.origin + "/?view=explorer" + encodeConfig(config));
      notify("Link copied. It restores these exact mission settings.");
    } catch {
      notify("Copy is unavailable. Copy the address from your browser instead.");
    }
  };
  const downloadCSV = () => {
    const url = URL.createObjectURL(new Blob([windowsCSV(result.windows, config)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `lunar-${config.site}-${config.start}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("Windows CSV downloaded with provenance.");
  };
  return {
    config,
    expert, setExpert,
    update,
    seek,
    data,
    siteData,
    sample,
    selected,
    results,
    result,
    loading,
    error,
    integrity,
    playing,
    setPlaying,
    speed,
    setSpeed,
    reduced,
    selectedWindow,
    setSelectedWindow,
    message,
    notify,
    copyLink,
    downloadCSV,
  };
}
