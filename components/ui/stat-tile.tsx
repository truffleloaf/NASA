import type { ReactNode } from "react";
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
  return (
    <div className={`ui-stat tone-${accent}`}>
      <span className="stat-label">
        {icon}
        {label}
      </span>
      <div className="stat-number">
        {value ?? "—"}
        {value !== null && <small>{unit}</small>}
      </div>
      {note && <p>{note}</p>}
      <ProvenanceBadge kind={kind} />
    </div>
  );
}
