from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import AsyncIterator

from langchain_core.output_parsers import StrOutputParser

from app.config import Settings
from app.llm import get_llm
from app.prompts import (
    ANSWER_PROMPT, CONDENSE_PROMPT, NOT_FOUND_MESSAGE, describe_location, format_context,
)
from app.vectorstore import VectorStoreManager

log = logging.getLogger(__name__)


def _to_text(content) -> str:
    """Chat chunks are a str for most providers, a list of blocks for some."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            b if isinstance(b, str) else b.get("text", "") for b in content
            if isinstance(b, (str, dict))
        )
    return ""


def _cited_ids(answer: str) -> set[int]:
    ids: set[int] = set()
    for group in re.findall(r"\[([^\]]+)\]", answer):
        ids.update(int(n) for n in re.findall(r"S(\d+)", group))
    return ids


class RagService:
    def __init__(self, store: VectorStoreManager, settings: Settings):
        self._store = store
        self._s = settings

    async def _condense(self, question: str, history: list[dict]) -> str:
        if not history:
            return question
        lines = [f"{m['role']}: {m['content'][:500]}" for m in history[-6:]]
        try:
            chain = CONDENSE_PROMPT | get_llm() | StrOutputParser()
            rewritten = (await chain.ainvoke({"history": "\n".join(lines), "question": question})).strip()
            return rewritten or question
        except Exception:
            log.exception("condense failed; using the original question")
            return question

    async def stream_answer(
        self, ws: str, question: str, history: list[dict], file_ids: list[str] | None
    ) -> AsyncIterator[dict]:
        standalone = await self._condense(question, history)

        hits = await asyncio.to_thread(self._store.search, ws, standalone, self._s.top_k, file_ids)
        hits = [(d, s) for d, s in hits if s >= self._s.min_score]

        # Nothing relevant: answer without calling the LLM (cheaper, no made-up answers).
        if not hits:
            yield {"event": "token", "data": {"t": NOT_FOUND_MESSAGE}}
            yield {"event": "sources", "data": {"sources": []}}
            yield {"event": "done", "data": {}}
            return

        context = format_context([d for d, _ in hits])
        chain = ANSWER_PROMPT | get_llm()

        parts: list[str] = []
        async for chunk in chain.astream({"context": context, "question": standalone}):
            text = _to_text(chunk.content)
            if text:
                parts.append(text)
                yield {"event": "token", "data": {"t": text}}
        answer = "".join(parts)

        yield {"event": "sources", "data": {"sources": self._sources(answer, hits)}}
        yield {"event": "done", "data": {}}

    @staticmethod
    def _sources(answer: str, hits) -> list[dict]:
        if NOT_FOUND_MESSAGE in answer:
            return []
        cited = sorted(n for n in _cited_ids(answer) if 1 <= n <= len(hits))
        numbers = cited or list(range(1, len(hits) + 1))  # uncited answer: show what was retrieved
        out = []
        for n in numbers:
            doc, score = hits[n - 1]
            md = doc.metadata
            out.append(
                {
                    "id": f"S{n}",
                    "file_id": md.get("file_id"),
                    "filename": md.get("filename"),
                    "location": describe_location(md),
                    "snippet": doc.page_content[:300],
                    "score": round(score, 3),
                }
            )
        return out
