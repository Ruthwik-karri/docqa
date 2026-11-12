import { useState } from "react";
import type { Source } from "../api/client";
import SourceChip from "./SourceChip";

/** Collapsed by default: click "Sources" to see which files and pages the answer used. */
export default function SourceList({ sources }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        Sources ({sources.length})
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m5 8 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="mt-1.5 flex flex-col items-start gap-1.5">
          {sources.map((s) => (
            <SourceChip key={s.id} source={s} />
          ))}
        </div>
      )}
    </div>
  );
}
