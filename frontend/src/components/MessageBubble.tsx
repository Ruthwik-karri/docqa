import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "../hooks/useChat";
import { stripCitations } from "../lib/text";
import SourceList from "./SourceList";

interface Props {
  message: Message;
  canRetry: boolean;
  onRetry: () => void;
}

export default function MessageBubble({ message, canRetry, onRetry }: Props) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-indigo-600 px-4 py-2.5 text-sm text-white">
          {message.content}
        </div>
      </div>
    );
  }

  const text = stripCitations(message.content, message.streaming);
  const waiting = message.streaming && !text && !message.error;

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800">
          {waiting ? (
            <span className="inline-flex items-center gap-1 text-slate-400" aria-label="Assistant is thinking">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:150ms]" />
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400 [animation-delay:300ms]" />
            </span>
          ) : (
            <div className="md">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
            </div>
          )}
          {message.error && (
            <div role="alert" className="mt-2 text-red-600">
              {message.error}
              {canRetry && (
                <button type="button" onClick={onRetry} className="ml-2 underline">
                  Retry
                </button>
              )}
            </div>
          )}
        </div>

        {message.sources && <SourceList sources={message.sources} />}
      </div>
    </div>
  );
}
