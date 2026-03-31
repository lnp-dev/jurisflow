# [IN PROGRESS] JurisFlow

JurisFlow is an AI-powered legal document intelligence platform designed for M&A professionals and legal teams. It combines a Knowledge Graph, a document ingestion pipeline with automatic PII redaction, and a GraphRAG-augmented chat interface to enable precise, cited question-answering over sensitive legal documents.

---

## How It Works

The system processes a legal document through a multi-stage pipeline before it can be queried:

1. **Ingestion**: Documents (PDF or DOCX) are parsed into structured text chunks using Docling.
2. **PII Detection and Redaction**: Each chunk is scanned by both a GLiNER NER model and Microsoft Presidio. Detected entities (persons, organizations, locations, etc.) are replaced with stable, deterministic tokens (e.g., `[ORG_1]`, `[PERSON_3]`). The original-to-token mapping is stored in a per-case redaction dictionary in PostgreSQL.
3. **Knowledge Graph Construction**: Gemini processes the redacted chunks in batches and extracts a structured graph of legal entities and relationships. Nodes (Company, Clause, Agreement, Asset, Person, Jurisdiction) and edges (ACQUIRES, GOVERNS, CONTAINS_CLAUSE, etc.) are written to Neo4j, each tagged with the source chunk IDs that produced them.
4. **Querying**: When a user asks a question, the prompt is first scrubbed through the redaction dictionary. The system then queries Neo4j for relevant graph subgraphs and retrieves the associated text chunks from PostgreSQL. Both graph context and narrative context are sent to Gemini in a streaming call. The response is rehydrated — redacted tokens in the answer are replaced back with their original values — before being streamed to the frontend.

---

## Architecture

```
jurisflow/
├── backend/
│   └── app/
│       ├── api/
│       │   └── endpoints/
│       │       ├── cases.py        # Case CRUD
│       │       ├── documents.py    # Upload, list, delete; triggers ingestion & graph build
│       │       └── chat.py         # /ask and /ask-stream endpoints
│       ├── core/
│       │   ├── config.py           # Settings loaded from .env
│       │   ├── database.py         # SQLModel + PostgreSQL session management
│       │   └── graph.py            # Neo4j driver connection
│       ├── models/
│       │   └── domain.py           # Case, Document, DocumentChunk, RedactionDictionary
│       ├── schemas/
│       │   └── responses.py        # API response schemas
│       ├── services/
│       │   ├── ingestion.py        # Docling parsing, GLiNER + Presidio PII redaction pipeline
│       │   ├── graphrag.py         # Gemini-powered knowledge graph extraction and Neo4j writes
│       │   └── chat.py             # Hybrid RAG retrieval, prompt rehydration, SSE streaming
│       └── main.py                 # FastAPI application entry point
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx            # Case dashboard
│       │   ├── cases/[caseId]/     # Case detail: document upload and management
│       │   ├── documents/          # Global document center with search and filtering
│       │   └── chat/               # GraphRAG chat interface with SSE streaming
│       ├── components/
│       │   └── layout/Sidebar.tsx  # Collapsible glassmorphic navigation sidebar
│       └── lib/
│           ├── api.ts              # Typed API client with SSE stream consumer
│           └── store.ts            # Zustand global UI state (PII toggle, sidebar, active case)
├── docker-compose.yml              # PostgreSQL (pgvector) and Neo4j services
└── .env.example                    # Environment variable template
```

---

## Technology Stack

### Backend
| Component | Technology |
| :--- | :--- |
| API Framework | FastAPI |
| ORM / DB Schema | SQLModel |
| Relational Database | PostgreSQL 16 with pgvector |
| Graph Database | Neo4j |
| Document Parsing | Docling |
| NER / Entity Extraction | GLiNER (`urchade/gliner_medium-v2.1`) |
| PII Redaction | Microsoft Presidio (Analyzer + Anonymizer) |
| LLM | Google Gemini (`gemini-2.5-flash`) |
| Streaming | Server-Sent Events (SSE) via FastAPI `StreamingResponse` |

### Frontend
| Component | Technology |
| :--- | :--- |
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion |
| Server State | TanStack React Query |
| Client State | Zustand |
| File Upload | react-dropzone |
| Markdown Rendering | react-markdown + remark-gfm |

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- Docker and Docker Compose
- A [Google AI Studio](https://aistudio.google.com/) API key with access to Gemini 2.5 Flash

---

## Setup and Installation

### 1. Clone the repository

```bash
git clone <your-repo-url>
cd jurisflow
```

### 2. Configure environment variables

Copy the template and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` with your actual values:

```ini
GEMINI_API_KEY=your_google_ai_studio_api_key

POSTGRES_SERVER=localhost
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=jurisflow
POSTGRES_PORT=5432

NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_secure_neo4j_password
```

### 3. Start the databases

```bash
docker compose up -d
```

This starts:
- PostgreSQL with pgvector on port `5432`
- Neo4j on ports `7474` (HTTP browser) and `7687` (Bolt)

### 4. Set up the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate       # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Start the backend development server:

```bash
export PYTHONPATH=$PYTHONPATH:.
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The API will be available at `http://localhost:8000`. Interactive API documentation is at `http://localhost:8000/docs`.

### 5. Set up the frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

---

## Usage

### Creating a Case and Uploading Documents

1. Open `http://localhost:3000` in your browser.
2. From the Case Dashboard, note the existing case or create one via the API (`POST /api/cases`).
3. Navigate to the case detail page and drag-and-drop a PDF or DOCX file into the upload zone.
4. The backend will immediately begin the ingestion pipeline in a background task. Document status updates from `uploaded` to `redacted` automatically.

### Building the Knowledge Graph

Once one or more documents have been ingested (status: `redacted`), click **Build Graph** on the case detail page. This triggers the `POST /api/cases/{case_id}/build-graph` endpoint, which sends all unprocessed chunks to Gemini for entity and relationship extraction and writes the resulting graph to Neo4j.

### Querying with the Chat Interface

1. Navigate to the **Chat** page.
2. Select a case from the dropdown in the header.
3. Type a question or click one of the suggested prompts.
4. The system will scrub your prompt, query the knowledge graph and text store, and stream a cited response back to the interface. Citations appear below each response as expandable cards showing the source text and page reference.

---

## API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/cases` | List all cases |
| `POST` | `/api/cases` | Create a new case |
| `DELETE` | `/api/cases/{case_id}` | Delete a case and all its data |
| `GET` | `/api/cases/{case_id}/documents` | List documents for a case |
| `POST` | `/api/cases/{case_id}/documents` | Upload a document (triggers ingestion) |
| `GET` | `/api/cases/{case_id}/documents/{doc_id}` | Get document details and parsed chunks |
| `DELETE` | `/api/cases/{case_id}/documents/{doc_id}` | Delete a document and clean up the graph |
| `POST` | `/api/cases/{case_id}/build-graph` | Extract and build the Knowledge Graph |
| `POST` | `/api/chat/scrub-prompt` | Redact PII from a prompt using the case dictionary |
| `POST` | `/api/chat/ask` | Ask a question (non-streaming) |
| `POST` | `/api/chat/ask-stream` | Ask a question with SSE streaming response |
| `GET` | `/health` | Backend health check |

---

## Data Models

### Document Status Flow

```
uploaded -> redacted -> graph_built
                  |
                  -> failed  (on ingestion error)
```

### Knowledge Graph Schema

**Node Labels:** `Company`, `Agreement`, `Clause`, `Asset`, `Person`, `Jurisdiction`

**Relationship Types:** `ACQUIRES`, `GOVERNS`, `CONTAINS_CLAUSE`, `OWNS_ASSET`, and arbitrary relationship types extracted by the LLM.

Every node and relationship stores:
- `case_id`: Scopes the graph to a specific case to prevent cross-case data leakage.
- `source_chunk_ids`: A list of PostgreSQL chunk IDs that produced this entity, enabling bidirectional traceability from graph to source text.

---

## Security Considerations

- All PII is redacted before being sent to any external LLM API. The Gemini model only ever sees tokenized entities such as `[COMPANY_1]` or `[PERSON_2]`, never the original names.
- The redaction dictionary is stored per-case in PostgreSQL. Token rehydration (substituting real values back into LLM responses) happens entirely server-side.
- CORS is configured to allow only `http://localhost:3000` by default. Update `app/main.py` for production deployments.
- The `.env` file is excluded from version control. Never commit actual credentials.

