import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { Message } from "../hooks/useChat";
import MessageBubble from "./MessageBubble";

const MAX_QUESTION = 2000;

interface Props {
  messages: Message[];
  busy: boolean;
  disabled: boolean;
  disabledReason: string;
  onSend: (question: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onClear: () => void;
}

export default function ChatWindow({
  messages,
  busy,
  disabled,
  disabledReason,
  onSend,
  onStop,
  onRetry,
  onClear,
}: Props) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const q = text.trim();
    if (!q || busy || disabled) return;
    onSend(q);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const lastIndex = messages.length - 1;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <h1 className="text-base font-semibold text-slate-800">Chat with your documents</h1>
        {messages.length > 0 && (
          <button type="button" onClick={onClear} className="text-sm text-slate-500 hover:text-slate-800">
            New chat
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="mx-auto mt-16 max-w-md text-center text-slate-500">
            <p className="text-lg font-medium text-slate-700">Ask anything about your files</p>
            <p className="mt-2 text-sm">
              Answers come only from the documents you upload, with sources you can open to check.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
            {messages.map((m, i) => (
              <MessageBubble
                key={m.id}
                message={m}
                canRetry={i === lastIndex && !busy && !disabled}
                onRetry={onRetry}
              />
            ))}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <form onSubmit={submit} className="border-t border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            maxLength={MAX_QUESTION}
            disabled={disabled}
            placeholder={disabled ? disabledReason : "Ask a question (Enter to send, Shift+Enter for a new line)"}
            aria-label="Your question"
            className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
          />
          {busy ? (
            <button
              type="button"
              onClick={onStop}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={disabled || !text.trim()}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
