from functools import lru_cache
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Export .env into os.environ so provider SDKs (OPENAI_API_KEY, ...) can see it.
load_dotenv()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:5173"]  # JSON list in env
    data_dir: Path = Path("data")

    # Uploads
    max_upload_mb: int = 25
    max_files_per_upload: int = 10
    max_concurrent_ingest: int = 2

    # Embeddings
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_device: str = "cpu"
    embedding_batch_size: int = 32

    # Splitting
    chunk_size: int = 1000
    chunk_overlap: int = 150
    excel_rows_per_chunk: int = 20
    excel_max_chunk_chars: int = 3000
    max_chunks_per_file: int = 5000

    # Retrieval
    top_k: int = 6
    min_score: float = 0.35  # cosine similarity; tune on your own documents
    max_cached_workspaces: int = 20

    # LLM
    llm_provider: Literal["groq", "openai", "azure_openai", "anthropic", "bedrock", "ollama"] = "groq"
    llm_model: str = ""
    llm_temperature: float | None = 0.0
    llm_max_tokens: int = 1024
    llm_timeout_s: int = 60
    aws_region: str = "ap-south-1"
    azure_api_version: str = "2024-10-21"
    ollama_base_url: str = "http://localhost:11434"

    @property
    def index_dir(self) -> Path:
        return self.data_dir / "indexes"

    @property
    def tmp_dir(self) -> Path:
        return self.data_dir / "tmp"


@lru_cache
def get_settings() -> Settings:
    return Settings()
