# DocQA: chat with your documents

Upload PDF, Word, Excel, CSV, TXT or Markdown files and ask questions. Answers come only
from your files, with sources. React + FastAPI + LangChain + Hugging Face embeddings + FAISS.

## Run with Docker

1. Create `backend/.env` from the template and fill in your Groq details:

   ```
   copy backend\.env.example backend\.env      # Windows
   cp backend/.env.example backend/.env        # Linux / macOS
   ```

   Set `LLM_PROVIDER=groq`, `LLM_MODEL=<model id>` and `GROQ_API_KEY=<key>`.

2. Build and start everything:

   ```
   docker compose up --build
   ```

3. Open http://localhost:8080

Useful commands:

```
docker compose logs -f backend      # watch the backend log
docker compose down                 # stop (your indexed files are kept)
docker compose down -v              # stop and DELETE all indexed files
```

The first build downloads PyTorch and the embedding model (several minutes). The backend
takes up to a minute to report healthy while it loads the model.

## Layout

```
backend/    FastAPI app (app/), Dockerfile
frontend/   React + Vite app, Dockerfile, nginx.conf
docker-compose.yml
```

Run the backend with a single worker. The FAISS indexes and write locks live inside the process.
