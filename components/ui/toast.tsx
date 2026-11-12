import { Check } from "lucide-react";
export function Toast({ message }: { message: string }) {
  return (
    <div className={`ui-toast ${message ? "visible" : ""}`} role="status" aria-live="polite">
      {message && (
        <>
          <Check />
          {message}
        </>
      )}
    </div>
  );
}
