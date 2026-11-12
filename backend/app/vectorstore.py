from __future__ import annotations

import json
import logging
import os
import re
import shutil
import threading
import uuid
from collections import OrderedDict
from contextlib import contextmanager

from langchain_community.vectorstores import FAISS
from langchain_community.vectorstores.utils import DistanceStrategy
from langchain_core.documents import Document

from app.config import Settings
from app.embeddings import get_embeddings

log = logging.getLogger(__name__)

WORKSPACE_RE = re.compile(r"[A-Za-z0-9_-]{8,64}")
DISTANCE = DistanceStrategy.MAX_INNER_PRODUCT  # scores returned are cosine similarity


class IndexMismatchError(RuntimeError):
    pass


class VectorStoreManager:
    """One FAISS index per workspace, saved to disk, cached in memory.

    Only load folders this class wrote: FAISS docstores are pickle-backed.
    """

    def __init__(self, settings: Settings):
        self._s = settings
        self._emb = get_embeddings()
        self._cache: OrderedDict[str, FAISS] = OrderedDict()
        self._locks: dict[str, threading.RLock] = {}
        self._guard = threading.Lock()
        self._s.index_dir.mkdir(parents=True, exist_ok=True)

    # ---------- internals ----------
    def _lock(self, ws: str) -> threading.RLock:
        if not WORKSPACE_RE.fullmatch(ws):
            raise ValueError("invalid workspace id")
        with self._guard:
            return self._locks.setdefault(ws, threading.RLock())

    def _dir(self, ws: str):
        return self._s.index_dir / ws

    def _load(self, ws: str) -> FAISS | None:  # call with the lock held
        if ws in self._cache:
            self._cache.move_to_end(ws)
            return self._cache[ws]
        d = self._dir(ws)
        if not (d / "index.faiss").exists():
            return None
        meta = json.loads((d / "meta.json").read_text())
        if meta.get("embedding_model") != self._s.embedding_model:
            raise IndexMismatchError(
                f"Index built with '{meta.get('embedding_model')}', "
                f"but EMBEDDING_MODEL is '{self._s.embedding_model}'. Rebuild the index."
            )
        vs = FAISS.load_local(
            str(d), self._emb, allow_dangerous_deserialization=True, distance_strategy=DISTANCE
        )
        self._put_cache(ws, vs)
        return vs

    def _put_cache(self, ws: str, vs: FAISS) -> None:
        self._cache[ws] = vs
        self._cache.move_to_end(ws)
        while len(self._cache) > self._s.max_cached_workspaces:
            self._cache.popitem(last=False)

    def _save(self, ws: str, vs: FAISS) -> None:
        """Atomic: write to a temp folder, then swap it in."""
        d = self._dir(ws)
        tmp = d.parent / f".{ws}.tmp-{uuid.uuid4().hex[:8]}"
        vs.save_local(str(tmp))
        (tmp / "meta.json").write_text(
            json.dumps(
                {
                    "embedding_model": self._s.embedding_model,
                    "dim": int(vs.index.d),
                    "chunks": int(vs.index.ntotal),
                }
            )
        )
        old = None
        if d.exists():
            old = d.parent / f".{ws}.old-{uuid.uuid4().hex[:8]}"
            os.replace(d, old)
        os.replace(tmp, d)
        if old:
            shutil.rmtree(old, ignore_errors=True)

    @contextmanager
    def _write(self, ws: str):
        """Lock + evict the cache entry if anything fails, so memory never drifts from disk."""
        with self._lock(ws):
            try:
                yield
            except Exception:
                self._cache.pop(ws, None)
                raise

    # ---------- public API ----------
    def add_documents(self, ws: str, file_id: str, docs: list[Document]) -> int:
        texts = [d.page_content for d in docs]
        vectors = self._emb.embed_documents(texts)  # slow: done outside the lock
        pairs = list(zip(texts, vectors))
        metas = [d.metadata for d in docs]
        ids = [f"{file_id}:{i}" for i in range(len(docs))]
        with self._write(ws):
            vs = self._load(ws)
            if vs is None:
                vs = FAISS.from_embeddings(
                    pairs, self._emb, metadatas=metas, ids=ids, distance_strategy=DISTANCE
                )
            else:
                vs.add_embeddings(pairs, metadatas=metas, ids=ids)
            self._save(ws, vs)
            self._put_cache(ws, vs)
        return len(docs)

    def delete_file(self, ws: str, file_id: str) -> int:
        prefix = f"{file_id}:"
        with self._write(ws):
            vs = self._load(ws)
            if vs is None:
                return 0
            ids = [i for i in vs.docstore._dict if i.startswith(prefix)]
            if not ids:
                return 0
            vs.delete(ids)
            self._save(ws, vs)
            return len(ids)

    def list_files(self, ws: str) -> list[dict]:
        with self._lock(ws):
            vs = self._load(ws)
            if vs is None:
                return []
            files: dict[str, dict] = {}
            for doc in vs.docstore._dict.values():
                md = doc.metadata
                fid = md.get("file_id")
                if not fid:
                    continue
                entry = files.setdefault(
                    fid,
                    {
                        "file_id": fid,
                        "filename": md.get("filename"),
                        "file_type": md.get("file_type"),
                        "sha256": md.get("sha256"),
                        "chunks": 0,
                    },
                )
                entry["chunks"] += 1
            return list(files.values())

    def search(
        self, ws: str, query: str, k: int, file_ids: list[str] | None = None
    ) -> list[tuple[Document, float]]:
        qvec = self._emb.embed_query(query)  # outside the lock
        allowed = set(file_ids) if file_ids else None
        with self._lock(ws):
            vs = self._load(ws)
            if vs is None or vs.index.ntotal == 0:
                return []
            flt = (lambda md: md.get("file_id") in allowed) if allowed else None
            results = vs.similarity_search_with_score_by_vector(
                qvec, k=k, filter=flt, fetch_k=max(k * 5, 25)
            )
        return [(doc, float(score)) for doc, score in results]
