import { useCallback, useRef, useState } from "react";
import { errorMessage, streamChat, type ChatTurn, type Source } from "../api/client";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  error?: string;
  streaming?: boolean;
}

const MAX_HISTORY = 10; // backend accepts up to 20
const MAX_TURN_CHARS = 4000; // backend limit per message

function newId(): string {
  return crypto.randomUUID();
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  const commit = useCallback((next: Message[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const patchMessage = useCallback(
    (id: string, patch: (m: Message) => Message) => {
      commit(messagesRef.current.map((m) => (m.id === id ? patch(m) : m)));
    },
    [commit],
  );

  const run = useCallback(
    async (question: string, base: Message[], fileIds: string[]) => {
      const history: ChatTurn[] = base
        .filter((m) => m.content.trim() && !m.error)
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_TURN_CHARS) }));

      const userMsg: Message = { id: newId(), role: "user", content: question };
      const botMsg: Message = { id: newId(), role: "assistant", content: "", streaming: true };
      commit([...base, userMsg, botMsg]);

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      try {
        const stream = streamChat(
          { question, history, file_ids: fileIds.length ? fileIds : undefined },
          controller.signal,
        );
        for await (const ev of stream) {
          if (ev.event === "token") {
            patchMessage(botMsg.id, (m) => ({ ...m, content: m.content + ev.data.t }));
          } else if (ev.event === "sources") {
            patchMessage(botMsg.id, (m) => ({ ...m, sources: ev.data.sources }));
          } else if (ev.event === "error") {
            patchMessage(botMsg.id, (m) => ({ ...m, error: ev.data.message }));
          }
        }
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          patchMessage(botMsg.id, (m) => ({ ...m, error: errorMessage(e) }));
        }
      } finally {
        patchMessage(botMsg.id, (m) => ({ ...m, streaming: false }));
        abortRef.current = null;
        setBusy(false);
      }
    },
    [commit, patchMessage],
  );

  const send = useCallback(
    async (question: string, fileIds: string[]) => {
      const text = question.trim();
      if (!text || abortRef.current) return;
      await run(text, messagesRef.current, fileIds);
    },
    [run],
  );

  const retry = useCallback(
    async (fileIds: string[]) => {
      if (abortRef.current) return;
      const all = messagesRef.current;
      let lastUser = -1;
      for (let i = all.length - 1; i >= 0; i--) {
        if (all[i].role === "user") {
          lastUser = i;
          break;
        }
      }
      if (lastUser < 0) return;
      await run(all[lastUser].content, all.slice(0, lastUser), fileIds);
    },
    [run],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => {
    abortRef.current?.abort();
    commit([]);
  }, [commit]);

  return { messages, busy, send, retry, stop, clear };
}
