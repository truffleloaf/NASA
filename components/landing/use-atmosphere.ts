"use client";
import { useEffect, useRef, useState, type RefObject } from "react";
export function useAtmosphere(host: RefObject<HTMLElement | null>) {
  const [environment, setEnvironment] = useState({ active: false, reduced: true, mobile: false, saveData: true });
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)"),
      small = matchMedia("(max-width: 767px)"),
      fine = matchMedia("(pointer: fine)");
    let intersecting = false;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    const update = () =>
      setEnvironment({
        active: intersecting && !document.hidden,
        reduced: motion.matches,
        mobile: small.matches,
        saveData: !!connection?.saveData,
      });
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    const move = (event: PointerEvent) => {
      if (!fine.matches || motion.matches) return;
      const rect = element.getBoundingClientRect();
      pointer.current = {
        x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
      };
    };
    const leave = () => {
      pointer.current = { x: 0, y: 0 };
    };
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", update);
    motion.addEventListener("change", update);
    small.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      document.removeEventListener("visibilitychange", update);
      motion.removeEventListener("change", update);
      small.removeEventListener("change", update);
    };
  }, [host]);
  return { ...environment, pointer };
}
export type Atmosphere = ReturnType<typeof useAtmosphere>;
