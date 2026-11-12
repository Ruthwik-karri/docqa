import { useState } from "react";
import type { Source } from "../api/client";

export default function SourceChip({ source }: { source: Source }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="max-w-full truncate rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-indigo-400 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        title={`${source.filename ?? "file"} (${source.location})`}
      >
        {source.filename ?? "file"} · {source.location}
      </button>
      {open && (
        <p className="mt-1 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
          {source.snippet}
          {source.snippet.length >= 300 ? "..." : ""}
        </p>
      )}
    </div>
  );
}
