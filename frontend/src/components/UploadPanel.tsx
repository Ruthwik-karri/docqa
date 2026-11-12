import { useRef, useState, type DragEvent } from "react";

const ACCEPT = ".pdf,.docx,.txt,.md,.xlsx,.xls,.csv";

interface Props {
  uploading: boolean;
  notices: string[];
  onUpload: (files: File[]) => void;
  onDismissNotices: () => void;
}

export default function UploadPanel({ uploading, notices, onUpload, onDismissNotices }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (list: FileList | null) => {
    if (list && list.length > 0) onUpload(Array.from(list));
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files);
  };

  return (
    <section aria-label="Upload documents" className="space-y-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-white"
        }`}
      >
        <p className="text-sm text-slate-600">Drag and drop files here</p>
        <p className="mt-0.5 text-xs text-slate-400">PDF, Word, Excel, CSV, TXT, MD up to 25 MB</p>
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploading..." : "Choose files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          aria-label="Choose files to upload"
          onChange={(e) => pick(e.target.files)}
        />
      </div>

      {notices.length > 0 && (
        <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <ul className="space-y-0.5">
            {notices.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <button type="button" onClick={onDismissNotices} className="mt-1 text-amber-700 underline">
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
