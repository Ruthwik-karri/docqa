from __future__ import annotations

from langchain_core.documents import Document
from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import Settings

MIN_CHUNK_CHARS = 20


def split_documents(docs: list[Document], settings: Settings) -> list[Document]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    out: list[Document] = []
    for doc in docs:
        if doc.metadata.get("pre_chunked"):  # Excel/CSV chunks are already sized
            out.append(doc)
        else:
            out.extend(splitter.split_documents([doc]))

    chunks = [d for d in out if len(d.page_content.strip()) >= MIN_CHUNK_CHARS]
    for d in chunks:
        d.metadata.pop("pre_chunked", None)
    return chunks
