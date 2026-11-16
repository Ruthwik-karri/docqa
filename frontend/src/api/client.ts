import { randomId } from "../lib/uuid";
export type FileStatus = "queued" | "processing" | "ready" | "failed";

export interface FileItem {
  file_id: string;
  filename: string;
  file_type: string;
  status: FileStatus;
  chunks: number;
  error: string | null;
}

export interface Source {
  id: string;
  file_id: string | null;
  filename: string | null;
  location: string;
  snippet: string;
  score: number;
}

export interface UploadResult {
  filename: string;
  status: "queued" | "duplicate" | "rejected";
  file_id?: string;
  reason?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatBody {
  question: string;
  history: ChatTurn[];
  file_ids?: string[];
}

export type ChatEvent =
  | { event: "token"; data: { t: string } }
  | { event: "sources"; data: { sources: Source[] } }
  | { event: "error"; data: { message: string } }
  | { event: "done"; data: Record<string, never> };

const API_BASE: string = import.meta.env.VITE_API_URL ?? "";
const STORAGE_KEY = "docqa.workspace";
const WORKSPACE_RE = /^[A-Za-z0-9_-]{8,64}$/;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let memoryId: string | null = null;

/** Anonymous per-browser workspace. Replaced by the verified user identity in the auth step. */
export function getWorkspaceId(): string {
  if (memoryId) return memoryId;
  let id: string | null = null;
  try {
    id = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked: fall back to memory */
  }
  if (!id || !WORKSPACE_RE.test(id)) {
    id = randomId();
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }
  memoryId = id;
  return id;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: { ...(init.headers ?? {}), "X-Workspace-Id": getWorkspaceId() },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") message = body.detail;
      else if (Array.isArray(body?.detail)) message = "The request was not valid.";
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return res;
}

export async function listFiles(): Promise<FileItem[]> {
  const res = await request("/api/v1/files");
  const body = (await res.json()) as { files: FileItem[] };
  return body.files;
}

export async function uploadFiles(files: File[]): Promise<UploadResult[]> {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const res = await request("/api/v1/files", { method: "POST", body: form });
  const body = (await res.json()) as { files: UploadResult[] };
  return body.files;
}

export async function deleteFile(fileId: string): Promise<void> {
  await request(`/api/v1/files/${fileId}`, { method: "DELETE" });
}

function parseEvent(raw: string): ChatEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) } as ChatEvent;
  } catch {
    return null;
  }
}

/** POST /chat and yield server-sent events as they arrive. */
export async function* streamChat(body: ChatBody, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await request("/api/v1/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.body) throw new ApiError("The server sent an empty response.", 0);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseEvent(raw);
      if (ev) yield ev;
    }
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof TypeError) return "Cannot reach the server. Is the backend running?";
  return e instanceof Error ? e.message : "Something went wrong.";
}
