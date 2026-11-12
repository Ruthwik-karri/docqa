import { useCallback, useEffect, useState } from "react";
import { deleteFile, errorMessage, listFiles, uploadFiles, type FileItem } from "../api/client";

const POLL_MS = 2000;

export function useFiles() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      setFiles(await listFiles());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while something is still being processed.
  const busy = files.some((f) => f.status === "queued" || f.status === "processing");
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [busy, refresh]);

  // Drop selections for files that are gone or not ready.
  useEffect(() => {
    setSelected((prev) => {
      const ready = new Set(files.filter((f) => f.status === "ready").map((f) => f.file_id));
      const next = new Set([...prev].filter((id) => ready.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [files]);

  const upload = useCallback(
    async (picked: File[]) => {
      if (picked.length === 0) return;
      setUploading(true);
      setNotices([]);
      try {
        const results = await uploadFiles(picked);
        const messages: string[] = [];
        for (const r of results) {
          if (r.status === "rejected") messages.push(`${r.filename}: ${r.reason ?? "rejected"}`);
          if (r.status === "duplicate") messages.push(`${r.filename}: already uploaded`);
        }
        setNotices(messages);
        await refresh();
      } catch (e) {
        setNotices([errorMessage(e)]);
      } finally {
        setUploading(false);
      }
    },
    [refresh],
  );

  const remove = useCallback(
    async (fileId: string) => {
      try {
        await deleteFile(fileId);
        setFiles((prev) => prev.filter((f) => f.file_id !== fileId));
      } catch (e) {
        setNotices([errorMessage(e)]);
        await refresh();
      }
    },
    [refresh],
  );

  const toggle = useCallback((fileId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const dismissNotices = useCallback(() => setNotices([]), []);

  return {
    files,
    loading,
    uploading,
    error,
    notices,
    selected,
    readyCount: files.filter((f) => f.status === "ready").length,
    upload,
    remove,
    toggle,
    clearSelection,
    dismissNotices,
    refresh,
  };
}
