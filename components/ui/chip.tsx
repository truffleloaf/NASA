import type { ComponentProps } from "react";
import { Check } from "lucide-react";
export function Chip({ selected = false, children, ...props }: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button type="button" className="ui-chip" aria-pressed={selected} {...props}>
      {selected && <Check aria-hidden="true" />}
      {children}
    </button>
  );
}
