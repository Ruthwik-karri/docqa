import ChatWindow from "./components/ChatWindow";
import FileList from "./components/FileList";
import UploadPanel from "./components/UploadPanel";
import { useChat } from "./hooks/useChat";
import { useFiles } from "./hooks/useFiles";

export default function App() {
  const files = useFiles();
  const chat = useChat();

  const selectedIds = [...files.selected];
  const noReadyFiles = files.readyCount === 0;

  return (
    <div className="flex h-full bg-slate-50 text-slate-900">
      <aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-slate-200 bg-slate-100 p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Documents</h2>
        <UploadPanel
          uploading={files.uploading}
          notices={files.notices}
          onUpload={(f) => void files.upload(f)}
          onDismissNotices={files.dismissNotices}
        />
        <FileList
          files={files.files}
          loading={files.loading}
          error={files.error}
          selected={files.selected}
          onToggle={files.toggle}
          onRemove={(id) => void files.remove(id)}
          onClearSelection={files.clearSelection}
          onRetryLoad={() => void files.refresh()}
        />
      </aside>

      <main className="min-w-0 flex-1">
        <ChatWindow
          messages={chat.messages}
          busy={chat.busy}
          disabled={noReadyFiles}
          disabledReason="Upload a document and wait until it is Ready"
          onSend={(q) => void chat.send(q, selectedIds)}
          onStop={chat.stop}
          onRetry={() => void chat.retry(selectedIds)}
          onClear={chat.clear}
        />
      </main>
    </div>
  );
}
