"use client";
import { useId } from "react";
import type { Provenance } from "@/lib/science";
export function ProvenanceBadge({
  kind = "Estimated",
  detail,
  className = "",
}: {
  kind?: Provenance;
  detail?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <>
    <button
      type="button"
      className={`provenance-badge ${className}`}
      popoverTarget={id}
      aria-label={`${kind}: explain provenance`}
    >
      <i aria-hidden="true" />
      {kind}
    </button>
    <span id={id} popover="auto" className="provenance-popover">
      <strong>{kind}</strong>
      <span>{detail ?? `${kind} data. Visibility and windows use hourly ephemeris and estimated terrain horizons.`}</span>
      <a href="/methods/">Read sources & limitations</a>
      <button type="button" popoverTarget={id} popoverTargetAction="hide" className="action-outline">Close</button>
    </span>
    </>
  );
}
