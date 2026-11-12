export function Skeleton({ label = "Loading bundled data", className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`ui-skeleton ${className}`} role="status">
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <p>{label}…</p>
    </div>
  );
}
