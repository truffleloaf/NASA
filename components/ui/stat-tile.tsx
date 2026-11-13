"use client";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Provenance } from "@/lib/science";
import { ProvenanceBadge } from "./provenance-badge";
export function StatTile({
  label,
  value,
  unit,
  note,
  icon,
  accent = "neutral",
  kind = "Estimated",
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  note?: ReactNode;
  icon?: ReactNode;
  accent?: string;
  kind?: Provenance;
}) {
  const reduced = useReducedMotion();
  return (
    <div className={`ui-stat tone-${accent}`}>
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <div className="stat-number" role="group" aria-label={`${value ?? "Unavailable"} ${value !== null ? (unit ?? "") : ""}`}>
        <AnimatePresence initial={false}>
          <motion.span
            aria-hidden="true"
            className="stat-value"
            key={String(value)}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.15 }}
          >
            {value ?? "—"}
            {value !== null && <small>{unit}</small>}
          </motion.span>
        </AnimatePresence>
      </div>
      {note && <p>{note}</p>}
      <ProvenanceBadge kind={kind} />
    </div>
  );
}
