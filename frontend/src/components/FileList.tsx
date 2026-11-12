import type { FileItem, FileStatus } from "../api/client";

interface Props {
  files: FileItem[];
  loading: boolean;
  error: string | null;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClearSelection: () => void;
  onRetryLoad: () => void;
}

const BADGE: Record<FileStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-slate-100 text-slate-600" },
  processing: { label: "Processing", cls: "bg-amber-100 text-amber-800" },
  ready: { label: "Ready", cls: "bg-emerald-100 text-emerald-800" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
};

export default function FileList({
  files,
  loading,
  error,
  selected,
  onToggle,
  onRemove,
  onClearSelection,
  onRetryLoad,
}: Props) {
  if (loading) return <p className="text-sm text-slate-400">Loading files...</p>;

  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
        <button type="button" onClick={onRetryLoad} className="ml-2 underline">
          Try again
        </button>
      </div>
    );
  }

  if (files.length === 0) {
    return <p className="text-sm text-slate-400">No documents yet. Upload one to start asking questions.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>{selected.size > 0 ? `Searching ${selected.size} selected` : "Searching all ready files"}</span>
        {selected.size > 0 && (
          <button type="button" onClick={onClearSelection} className="text-indigo-600 hover:underline">
            Clear
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {files.map((f) => {
          const badge = BADGE[f.status];
          const ready = f.status === "ready";
          return (
            <li key={f.file_id} className="rounded-lg border border-slate-200 bg-white p-2">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-indigo-600 disabled:opacity-40"
                  checked={selected.has(f.file_id)}
                  disabled={!ready}
                  onChange={() => onToggle(f.file_id)}
                  aria-label={`Limit search to ${f.filename}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800" title={f.filename}>
                    {f.filename}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className={`rounded-full px-2 py-0.5 ${badge.cls}`}>{badge.label}</span>
                    {ready && <span className="text-slate-400">{f.chunks} chunks</span>}
                  </div>
                  {f.error && <p className="mt-1 text-xs text-red-600">{f.error}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete "${f.filename}"? This removes it from search.`)) onRemove(f.file_id);
                  }}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  aria-label={`Delete ${f.filename}`}
                >
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M4 6h12M8 6V4h4v2m-6 0 .6 10h6.8L14 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
