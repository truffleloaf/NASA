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
  return (
    <a
      className={`provenance-badge ${className}`}
      href="/methods/"
      title={detail ?? `${kind} data. Read sources, resolution and limitations.`}
      aria-label={`${kind}: ${detail ?? "view methods and data sources"}`}
    >
      <i aria-hidden="true" />
      {kind}
    </a>
  );
}
