import type { ReactNode } from "react";
export function SectionLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`mono-caps ${className}`}>{children}</span>;
}
