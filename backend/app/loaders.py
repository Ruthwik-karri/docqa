from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd
from langchain_community.document_loaders import Docx2txtLoader, PyPDFLoader, TextLoader
from langchain_core.documents import Document

from app.config import Settings

log = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = frozenset({".pdf", ".docx", ".txt", ".md", ".xlsx", ".xls", ".csv"})


class UnsupportedFileType(ValueError):
    pass


class EmptyDocumentError(ValueError):
    pass


def validate_signature(ext: str, head: bytes) -> bool:
    """Check the file's real content, not just its extension."""
    match ext:
        case ".pdf":
            return head.startswith(b"%PDF")
        case ".docx" | ".xlsx":
            return head.startswith(b"PK\x03\x04")
        case ".xls":
            return head.startswith(b"\xd0\xcf\x11\xe0")
        case _:
            return b"\x00" not in head


def load_documents(path: Path, settings: Settings) -> list[Document]:
    ext = path.suffix.lower()
    match ext:
        case ".pdf":
            docs = _load_pdf(path)
        case ".docx":
            docs = _load_docx(path)
        case ".txt" | ".md":
            docs = _load_text(path)
        case ".xlsx" | ".xls":
            docs = _load_excel(path, settings)
        case ".csv":
            docs = _load_csv(path, settings)
        case _:
            raise UnsupportedFileType(f"Unsupported file type: {ext or 'unknown'}")

    docs = [d for d in docs if d.page_content.strip()]
    if not docs:
        raise EmptyDocumentError(
            "No readable text found. If this is a scanned PDF, it needs OCR first."
        )
    return docs


def _load_pdf(path: Path) -> list[Document]:
    docs = PyPDFLoader(str(path)).load()
    # Keep only what we need (drops the server path in "source"); pages are 1-based.
    return [
        Document(page_content=d.page_content, metadata={"page": int(d.metadata.get("page", 0)) + 1})
        for d in docs
    ]


def _load_docx(path: Path) -> list[Document]:
    docs = Docx2txtLoader(str(path)).load()
    return [Document(page_content=d.page_content, metadata={}) for d in docs]


def _load_text(path: Path) -> list[Document]:
    docs = TextLoader(str(path), autodetect_encoding=True).load()
    return [Document(page_content=d.page_content, metadata={}) for d in docs]


def _load_excel(path: Path, settings: Settings) -> list[Document]:
    sheets = pd.read_excel(path, sheet_name=None, dtype=str)
    docs: list[Document] = []
    for sheet_name, df in sheets.items():
        docs.extend(_frame_to_docs(df, str(sheet_name), settings))
    return docs


def _load_csv(path: Path, settings: Settings) -> list[Document]:
    df = pd.read_csv(path, dtype=str, encoding_errors="replace", on_bad_lines="skip")
    return _frame_to_docs(df, "csv", settings)


def _frame_to_docs(df: pd.DataFrame, sheet: str, settings: Settings) -> list[Document]:
    """Turn a table into row-based chunks: 'Column: value | Column: value' lines,
    with the header repeated in every chunk so each chunk is self-explanatory."""
    df = df.dropna(how="all").dropna(axis=1, how="all").fillna("")
    if df.empty:
        return []

    headers = [str(c).strip() or f"Column {i + 1}" for i, c in enumerate(df.columns)]
    header_line = f"Sheet: {sheet} | Columns: {', '.join(headers)}"

    docs: list[Document] = []
    lines: list[str] = []
    first_row = last_row = 0
    size = 0

    def flush() -> None:
        nonlocal lines, size
        if lines:
            docs.append(
                Document(
                    page_content="\n".join([header_line, *lines]),
                    metadata={"sheet": sheet, "rows": f"{first_row}-{last_row}", "pre_chunked": True},
                )
            )
        lines, size = [], 0

    for idx, row in zip(df.index, df.itertuples(index=False, name=None)):
        cells = [f"{h}: {str(v).strip()}" for h, v in zip(headers, row) if str(v).strip()]
        if not cells:
            continue
        excel_row = int(idx) + 2  # row 1 is the header
        line = " | ".join(cells)
        if lines and (
            len(lines) >= settings.excel_rows_per_chunk
            or size + len(line) > settings.excel_max_chunk_chars
        ):
            flush()
        if not lines:
            first_row = excel_row
        lines.append(line)
        last_row = excel_row
        size += len(line)
    flush()
    return docs
