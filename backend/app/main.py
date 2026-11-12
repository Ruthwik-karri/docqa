from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
import threading
import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Annotated, Literal

from fastapi import BackgroundTasks, Depends, FastAPI, File, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import get_settings
from app.embeddings import get_embeddings
from app.llm import get_llm
from app.loaders import (
    SUPPORTED_EXTENSIONS, EmptyDocumentError, UnsupportedFileType, load_documents, validate_signature,
)
from app.rag import RagService
from app.splitter import split_documents
from app.vectorstore import WORKSPACE_RE, VectorStoreManager

settings = get_settings()


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {"ts": self.formatTime(record), "level": record.levelname,
                   "logger": record.name, "msg": record.getMessage()}
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


handler = logging.StreamHandler()
handler.setFormatter(JsonFormatter())
logging.basicConfig(level=settings.log_level, handlers=[handler], force=True)
log = logging.getLogger("docqa")


# ---------- ingestion job tracking (in memory; moves to a DB later) ----------
@dataclass
class Job:
    file_id: str
    filename: str
    sha256: str
    status: Literal["queued", "processing", "ready", "failed"] = "queued"
    error: str | None = None
    chunks: int = 0


jobs: dict[str, dict[str, Job]] = {}
ingest_slots = threading.Semaphore(settings.max_concurrent_ingest)


def _ingest(ws: str, job: Job, path: Path) -> None:
    store: VectorStoreManager = app.state.store
    with ingest_slots:
        job.status = "processing"
        try:
            docs = load_documents(path, settings)
            chunks = split_documents(docs, settings)
            if not chunks:
                raise EmptyDocumentError("No readable text found.")
            if len(chunks) > settings.max_chunks_per_file:
                raise ValueError(f"File is too large ({len(chunks)} chunks; limit {settings.max_chunks_per_file}).")
            for i, c in enumerate(chunks):
                c.metadata.update(file_id=job.file_id, filename=job.filename,
                                  file_type=path.suffix.lower().lstrip("."),
                                  sha256=job.sha256, chunk_index=i)
            job.chunks = store.add_documents(ws, job.file_id, chunks)
            job.status = "ready"
            jobs.get(ws, {}).pop(job.file_id, None)  # ready files are listed from the index
        except (UnsupportedFileType, EmptyDocumentError, ValueError) as e:
            job.status, job.error = "failed", str(e)
        except Exception:
            log.exception("ingest failed for %s", job.filename)
            job.status, job.error = "failed", "Processing failed. Please try again."
        finally:
            path.unlink(missing_ok=True)


# ---------- app ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    for stale in settings.tmp_dir.glob("*"):  # leftovers from a crash
        stale.unlink(missing_ok=True)
    await asyncio.to_thread(get_embeddings)  # load the model once, before serving
    app.state.store = VectorStoreManager(settings)
    app.state.rag = RagService(app.state.store, settings)
    log.info("ready: embedding model %s loaded", settings.embedding_model)
    yield


app = FastAPI(title="DocQA", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type", "X-Workspace-Id", "Authorization"],
)


@app.middleware("http")
async def request_log(request: Request, call_next):
    rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid
    log.info("%s %s -> %s %.0fms rid=%s", request.method, request.url.path,
             response.status_code, (time.perf_counter() - start) * 1000, rid)
    return response


def workspace_id(x_workspace_id: Annotated[str | None, Header()] = None) -> str:
    # TODO(auth step): derive this from the verified JWT, never from a client header.
    if not x_workspace_id or not WORKSPACE_RE.fullmatch(x_workspace_id):
        raise HTTPException(400, "Missing or invalid X-Workspace-Id header")
    return x_workspace_id


Workspace = Annotated[str, Depends(workspace_id)]
FILE_ID_RE = re.compile(r"[0-9a-f]{32}")


# ---------- health ----------
@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    checks = {"embeddings": get_embeddings.cache_info().currsize > 0,
              "storage_writable": settings.index_dir.exists()}
    try:
        get_llm()
        checks["llm_configured"] = True
    except Exception:
        checks["llm_configured"] = False
    if not all(checks.values()):
        raise HTTPException(503, detail=checks)
    return {"status": "ready", **checks}


# ---------- files ----------
def _safe_name(name: str | None) -> str:
    base = Path(name or "file").name
    return re.sub(r"[\x00-\x1f]", "", base)[:150] or "file"


async def _accept(upload: UploadFile, ws: str, known: dict[str, str],
                  background: BackgroundTasks) -> dict:
    filename = _safe_name(upload.filename)
    ext = Path(filename).suffix.lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return {"filename": filename, "status": "rejected", "reason": f"Unsupported type '{ext}'"}

    file_id = uuid.uuid4().hex
    tmp = settings.tmp_dir / f"{file_id}{ext}"
    limit = settings.max_upload_mb * 1024 * 1024
    sha, size, head = hashlib.sha256(), 0, b""
    try:
        with tmp.open("wb") as out:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise ValueError(f"File exceeds {settings.max_upload_mb} MB")
                if not head:
                    head = chunk[:16]
                sha.update(chunk)
                out.write(chunk)
        if size == 0:
            raise ValueError("File is empty")
        if not validate_signature(ext, head):
            raise ValueError("File content does not match its extension")
    except ValueError as e:
        tmp.unlink(missing_ok=True)
        return {"filename": filename, "status": "rejected", "reason": str(e)}

    digest = sha.hexdigest()
    if digest in known:
        tmp.unlink(missing_ok=True)
        return {"filename": filename, "status": "duplicate", "file_id": known[digest]}

    job = Job(file_id=file_id, filename=filename, sha256=digest)
    jobs.setdefault(ws, {})[file_id] = job
    known[digest] = file_id
    background.add_task(_ingest, ws, job, tmp)
    return {"filename": filename, "status": "queued", "file_id": file_id}


@app.post("/api/v1/files", status_code=202)
async def upload_files(request: Request, background: BackgroundTasks, ws: Workspace,
                       files: list[UploadFile] = File(...)):
    if len(files) > settings.max_files_per_upload:
        raise HTTPException(400, f"At most {settings.max_files_per_upload} files per upload")
    store: VectorStoreManager = request.app.state.store
    indexed = await asyncio.to_thread(store.list_files, ws)
    known = {f["sha256"]: f["file_id"] for f in indexed if f.get("sha256")}
    known.update({j.sha256: j.file_id for j in jobs.get(ws, {}).values() if j.status != "failed"})
    return {"files": [await _accept(f, ws, known, background) for f in files]}


@app.get("/api/v1/files")
async def list_files(request: Request, ws: Workspace):
    store: VectorStoreManager = request.app.state.store
    indexed = await asyncio.to_thread(store.list_files, ws)
    items = [{"file_id": f["file_id"], "filename": f["filename"], "file_type": f["file_type"],
              "status": "ready", "chunks": f["chunks"], "error": None} for f in indexed]
    items += [{"file_id": j.file_id, "filename": j.filename, "file_type": Path(j.filename).suffix.lstrip("."),
               "status": j.status, "chunks": j.chunks, "error": j.error}
              for j in jobs.get(ws, {}).values()]
    return {"files": items}


@app.delete("/api/v1/files/{file_id}", status_code=204)
async def delete_file(file_id: str, request: Request, ws: Workspace):
    if not FILE_ID_RE.fullmatch(file_id):
        raise HTTPException(400, "Invalid file id")
    store: VectorStoreManager = request.app.state.store
    removed = await asyncio.to_thread(store.delete_file, ws, file_id)
    job = jobs.get(ws, {}).pop(file_id, None)
    if not removed and not job:
        raise HTTPException(404, "File not found")


# ---------- chat ----------
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=4000)


class ChatRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    file_ids: list[str] | None = Field(default=None, max_length=50)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@app.post("/api/v1/chat")
async def chat(body: ChatRequest, request: Request, ws: Workspace):
    if body.file_ids and not all(FILE_ID_RE.fullmatch(f) for f in body.file_ids):
        raise HTTPException(400, "Invalid file id")
    rag: RagService = request.app.state.rag
    history = [m.model_dump() for m in body.history]

    async def stream():
        try:
            async for ev in rag.stream_answer(ws, body.question.strip(), history, body.file_ids):
                yield _sse(ev["event"], ev["data"])
        except Exception:
            log.exception("chat failed")
            yield _sse("error", {"message": "Something went wrong. Please try again."})

    return StreamingResponse(
        stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
