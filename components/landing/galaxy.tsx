"use client";
import { useEffect, useRef, type RefObject } from "react";
import { makeStars, seededRandom } from "./galaxy-model";
import type { Atmosphere } from "./use-atmosphere";
const SHOOTING_STARS = true;
export default function Galaxy({ host, atmosphere }: { host: RefObject<HTMLElement | null>; atmosphere: Atmosphere }) {
  const starsRef = useRef<HTMLCanvasElement>(null),
    nebulaRef = useRef<HTMLCanvasElement>(null),
    time = useRef(0);
  useEffect(() => {
    const canvas = nebulaRef.current;
    if (!canvas) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = offscreen.height = 700;
    const ctx = offscreen.getContext("2d"),
      target = canvas.getContext("2d");
    if (!ctx || !target) return;
    const style = getComputedStyle(canvas),
      colors = ["--galaxy-core", "--galaxy-arm", "--starlight"].map((name) => style.getPropertyValue(name).trim());
    const random = seededRandom(441);
    const puff = (x: number, y: number, radius: number, color: string, alpha: number) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, color + "00");
      ctx.globalAlpha = alpha;
      ctx.fillStyle = gradient;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    puff(350, 350, 260, colors[0], 0.35);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const t = (i / 89 - 0.5) * 5,
        r = 48 * Math.exp(Math.abs(t) * 0.64),
        angle = t * 0.4 + (t < 0 ? Math.PI : 0) - 0.7;
      puff(
        350 + Math.cos(angle) * r,
        350 + Math.sin(angle) * r,
        35 + random() * 80,
        colors[i % 3],
        0.02 + random() * 0.04,
      );
    }
    ctx.fillStyle = colors[2];
    for (let i = 0; i < 600; i++) {
      const t = random() * 6 - 3,
        r = 45 * Math.exp(Math.abs(t) * 0.6),
        a = t * 0.4 + (t < 0 ? Math.PI : 0) - 0.7;
      ctx.globalAlpha = 0.02 + random() * 0.04;
      ctx.fillRect(
        350 + Math.cos(a) * r + (random() - 0.5) * 90,
        350 + Math.sin(a) * r + (random() - 0.5) * 90,
        0.6,
        0.6,
      );
    }
    target.drawImage(offscreen, 0, 0);
    offscreen.width = offscreen.height = 0;
  }, []);
  useEffect(() => {
    const canvas = starsRef.current,
      hero = host.current;
    if (!canvas || !hero) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const stars = makeStars(atmosphere.mobile),
      starlight = getComputedStyle(canvas).getPropertyValue("--starlight").trim();
    let width = 0,
      height = 0,
      cx = 0,
      cy = 0,
      copy = { left: 0, top: 0, right: 0, bottom: 0 },
      frame = 0,
      last = 0;
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.rect(copy.left, copy.top, copy.right - copy.left, copy.bottom - copy.top);
      ctx.clip("evenodd");
      ctx.fillStyle = starlight;
      for (const star of stars) {
        const a = star.angle + time.current * star.speed,
          r = star.orbit * Math.max(width, height);
        const x = cx + Math.cos(a) * r + (atmosphere.reduced ? 0 : atmosphere.pointer.current.x * star.parallax),
          y = cy + Math.sin(a) * r + (atmosphere.reduced ? 0 : atmosphere.pointer.current.y * star.parallax);
        const twinkle =
          !atmosphere.reduced && star.layer === 2
            ? 1 + 0.2 * Math.sin((time.current * Math.PI * 2) / star.period + star.phase)
            : 1;
        ctx.globalAlpha = Math.min(1, star.alpha * twinkle) * (x < width * 0.55 ? 0.25 : 1);
        ctx.beginPath();
        ctx.arc(x, y, star.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      const cycle = Math.floor(time.current / 34),
        streak = (time.current % 34) - 27 - (cycle % 5);
      if (SHOOTING_STARS && !atmosphere.reduced && streak >= 0 && streak < 0.6) {
        const x = width * 0.7 + streak * 150,
          y = height * 0.16 + streak * 60;
        ctx.globalAlpha = Math.sin((streak / 0.6) * Math.PI) * 0.7;
        ctx.strokeStyle = starlight;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 84, y - 32);
        ctx.stroke();
      }
      ctx.restore();
    };
    const resize = () => {
      const rect = hero.getBoundingClientRect(),
        text = hero.querySelector(".hero-copy")?.getBoundingClientRect(),
        anchor = getComputedStyle(hero);
      width = rect.width;
      height = rect.height;
      cx = (parseFloat(anchor.getPropertyValue("--moon-x")) / 100) * width;
      cy = (parseFloat(anchor.getPropertyValue("--moon-y")) / 100) * height;
      if (text)
        copy = {
          left: text.left - rect.left - 12,
          top: text.top - rect.top - 12,
          right: text.right - rect.left + 12,
          bottom: text.bottom - rect.top + 12,
        };
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(hero);
    const copyElement = hero.querySelector(".hero-copy");
    if (copyElement) observer.observe(copyElement);
    resize();
    const tick = (now: number) => {
      if (!last) last = now;
      if (now - last >= 1000 / 30) {
        time.current += Math.min((now - last) / 1000, 0.1);
        last = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    if (atmosphere.active && !atmosphere.reduced) frame = requestAnimationFrame(tick);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [host, atmosphere.active, atmosphere.reduced, atmosphere.mobile, atmosphere.pointer]);
  return (
    <div className="galaxy" aria-hidden="true" data-running={atmosphere.active && !atmosphere.reduced}>
      <div className="galaxy-nebula-clip">
        <div className="galaxy-nebula-anchor">
          <canvas ref={nebulaRef} width={700} height={700} className="galaxy-nebula" />
        </div>
      </div>
      <canvas ref={starsRef} className="galaxy-stars" />
    </div>
  );
}
