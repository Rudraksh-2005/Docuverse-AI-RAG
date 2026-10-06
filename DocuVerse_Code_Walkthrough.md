# DocuVerse AI — `main1.py` Line-by-Line Walkthrough

This explains the actual code you showed me, block by block, in the order it appears. Read this alongside the concepts doc — this one is "what does this exact line do," that one is "why does this pattern exist in RAG generally."

---

## 1. Imports and Setup

```python
from multiprocessing import context
```
This import is unused/dead code — `context` from `multiprocessing` isn't referenced anywhere in the file. Every other `context` variable in the code is just a local Python string variable, unrelated to this import. **If asked "what does this do?" — be honest: "that's an unused import, probably leftover from an edit, it doesn't do anything."** Interviewers respect honesty about small code smells far more than a made-up justification.

```python
import os
import shutil
import uvicorn
```
- `os` — used for filesystem paths (`os.path.join`, `os.makedirs`, `os.getenv` for the Groq API key).
- `shutil` — imported but not actually used in this file (another unused import — you'd normally use it for copying/moving files).
- `uvicorn` — the ASGI server that actually runs your FastAPI app (`uvicorn.run(...)` at the bottom).

```python
from dotenv import load_dotenv
```
Loads variables from a `.env` file into the process environment, so `os.getenv("GROQ_API_KEY")` later can find it without hardcoding the key in source.

```python
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
```
- `FastAPI` — the app object itself.
- `File`, `UploadFile` — used in the `/upload` route to accept file uploads.
- `CORSMiddleware` — lets your separately-hosted frontend (different port/origin) call this API without the browser blocking it.
- `BaseModel` — Pydantic base class you subclass to define request body schemas (`QueryRequest`, `CompareRequest`, `SearchRequest`).

```python
from backend.services.export_service import create_report
```
Pulls in the PDF report-generation function from your separate `export_service.py` module — used later in `/export`.

```python
from fastapi.responses import FileResponse
```
Lets a route return an actual file (used twice — once here, redundantly imported again lower in the file near `/pdf`).

```python
load_dotenv()
```
Actually executes the loading of `.env` at import time, before anything else runs.

---

## 2. The Commented-Out Imports

```python
# from services.rag_services import (...)
# from services.summary_services import (...)
# from services.suggestion_service import (...)
# from services.insights_service import (...)
```
These suggest the original design intended to split logic into separate service modules (a cleaner architecture), but at some point you **inlined those functions directly into `main1.py` instead** (you can see `build_summary_prompt`, `build_suggestion_prompt`, `build_insights_prompt`, `get_embeddings` all defined right below, in this same file). This is a completely normal thing that happens during fast iteration/prototyping.

**If asked about this:** "I originally planned a modular services folder, but for speed I collapsed the prompt-building functions into `main1.py` directly — a clean refactor step would be splitting these back out." This shows architectural self-awareness, which interviewers like.

---

## 3. The Standalone Prompt-Builder Functions

```python
def build_summary_prompt(context):
    return f"""
    Generate:
    Executive Summary
    Key Points
    Important Dates
    Risks
    Action Items

    {context}
    """
```
A plain Python f-string template. It takes retrieved document text (`context`) and wraps it with instructions telling the LLM what sections to produce. **Important honesty note:** this specific function is actually never called anywhere in the file — the real `/summary` route builds its own inline prompt (with a different, more precise format using `#` headers) directly inside the route function instead of calling this one. This is dead/unused code, similar to the `context` import.

```python
def build_suggestion_prompt(context):
    return f"""
    Generate 5 useful questions.

    {context}
    """
```
Also unused — `/suggestions` builds its own inline prompt instead of calling this.

```python
def build_insights_prompt(context):
    return f"""
    Extract:
    - Dates
    - People
    - Organizations
    - Money
    - Risks

    {context}
    """
```
This one **is actually used** — the `/insights` route calls `build_insights_prompt(context)`. This defines the 5 categories of information the LLM should pull out of the retrieved chunks.

```python
def build_followup_prompt(question, answer):
    return f"""
Generate 3 useful follow-up questions.

Question:
{question}

Answer:
{answer}

Return only questions.
"""
```
Used by `/followups`. Takes a Q&A pair and asks the LLM to propose natural next questions a user might ask — a common UX pattern to keep users engaged (like "related questions" on Google).

```python
#from langchain_community.document_loaders import PyPDFLoader
#from langchain_text_splitters import RecursiveCharacterTextSplitter
```
Commented out at the top level because these are instead imported **locally inside** the `/upload` route function (see below) — likely done deliberately to delay the (somewhat slow) import cost until it's actually needed, rather than at server startup.

```python
from langchain_groq import ChatGroq
```
The LangChain wrapper class around Groq's chat completion API — this is what actually talks to the LLM.

---

## 4. App Configuration

```python
app = FastAPI(title="DocuVerse AI")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
Creates the FastAPI app instance, then wraps it with CORS middleware. `allow_origins=["*"]` means **any** frontend origin can call this API — fine for local dev, but **a real interview follow-up will be "is this safe for production?"** Answer honestly: no — `allow_origins=["*"]` combined with `allow_credentials=True` is actually a configuration the CORS spec technically disallows/browsers will reject in some cases, and for production you'd lock `allow_origins` down to your actual frontend's domain.

```python
VECTOR_STORE_DIR = "db"
UPLOAD_DIR = "uploads"

os.makedirs(UPLOAD_DIR, exist_ok=True)
```
Defines the two folders used for persistence, and ensures the uploads folder exists at startup (`exist_ok=True` means no error if it already exists). Note: `VECTOR_STORE_DIR` is defined but **never actually used** — the `/upload` route redefines its own local `DB_DIR = "db"` instead of referencing this constant. Another small inconsistency worth knowing about.

```python
vectorstores = {}
vectorstore = None
current_document = None
chat_history = {}
latest_summary = ""
latest_insights = ""
```
These are **global, in-memory, process-wide state variables** — this is the most important architectural fact about this app, and a guaranteed interview question:

- `vectorstores` — a dict mapping `filename -> path to that document's ChromaDB folder on disk`. Note it stores the *path*, not the live object — each route reopens `Chroma(persist_directory=...)` fresh when needed.
- `vectorstore` — declared but never actually used as global state (each route creates its own local `vectorstore` variable instead).
- `current_document` — tracks which single document is "active" for chat/summary/insights/search. This means **the whole app is single-document-focused at any moment** — you can have many documents indexed, but only one selected at a time (except in `/compare`, which explicitly takes two document names).
- `chat_history` — dict mapping `filename -> list of {question, answer} dicts`, i.e., per-document conversation history.
- `latest_summary`, `latest_insights` — cache the most recently generated summary/insights text so `/export` can grab them without recomputing.

**Critical interview point:** because these are plain Python global variables (not a database), **all of this state is lost when the server restarts**, and it's **shared across all users** — there's no per-user session concept. If two people used this app against the same running server, they'd share the same `current_document` and step on each other's chat history. This is the single most important limitation to be upfront about.

---

## 5. Pydantic Request Models

```python
class QueryRequest(BaseModel):
    query: str

class CompareRequest(BaseModel):
    doc1: str
    doc2: str

class SearchRequest(BaseModel):
    query: str
```
These define the expected JSON shape of incoming POST bodies. FastAPI uses these to auto-validate requests (reject with a clear 422 error if `query` is missing or the wrong type) and to auto-generate the Swagger schema at `/docs`. Note `QueryRequest` and `SearchRequest` are functionally identical (both just `{query: str}`) — could have been the same class, reused.

---

## 6. Lazy-Loaded Singletons: `get_embeddings()` and `get_llm()`

```python
_embeddings = None

def get_embeddings():
    global _embeddings
    if _embeddings is None:
        from langchain_huggingface import HuggingFaceEmbeddings
        _embeddings = HuggingFaceEmbeddings(
            model_name="sentence-transformers/all-MiniLM-L6-v2"
        )
    return _embeddings
```
This is the **lazy singleton pattern**: the actual embedding model is only loaded from HuggingFace the *first time* `get_embeddings()` is called, and cached in the module-level `_embeddings` variable so every subsequent call reuses the same loaded model instead of reloading it from disk/memory each time (loading a sentence-transformer model is relatively expensive — you don't want to do it on every single request).

- Model: `all-MiniLM-L6-v2` — a small (~22M parameter), fast sentence-transformer producing **384-dimensional** embeddings. Good default trade-off of speed vs. semantic quality; this is a very commonly used "good enough, fast, free" embedding model.

```python
_llm = None

def get_llm():
    global _llm
    if _llm is None:
        _llm = ChatGroq(
            model="llama-3.1-8b-instant",
            temperature=0.3,
            api_key=os.getenv("GROQ_API_KEY")
        )
    return _llm
```
Same lazy singleton pattern, for the LLM client this time.

- Model: `llama-3.1-8b-instant` — an 8-billion-parameter Llama 3.1 model, served on Groq's fast inference hardware, tuned by Groq for low-latency/quick responses ("instant" tier).
- `temperature=0.3` — fairly low temperature, meaning the model's output is more deterministic/focused and less "creative"/random. This is a deliberate choice for a RAG Q&A/summary app, where you want faithful, consistent answers grounded in retrieved context rather than creative variation.
- `api_key=os.getenv("GROQ_API_KEY")` — pulled from the `.env` file loaded earlier.

**Interview question to expect:** "Why lazy-load these instead of creating them at module level?" Answer: avoids paying the model-loading cost at server startup (faster boot, and if the server never receives a request, it never loads the model at all) — plus it keeps import-time side effects minimal.

---

## 7. `GET /` — Health Check

```python
@app.get("/")
def home():
    return {"status": "running", "name": "DocuVerse AI"}
```
Simple liveness check — confirms the server is up. Notice this is a **synchronous** (`def`, not `async def`) route — fine here since it does no I/O, but worth knowing FastAPI supports both and you're mixing sync and async routes throughout this file (most are `async def`, this one and `/documents`, `/select-document`, `/history` are plain `def`).

---

## 8. `POST /upload` — Ingestion Pipeline (the core of the app)

```python
@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    from langchain_community.document_loaders import PyPDFLoader
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    from langchain_community.vectorstores import Chroma
```
`file: UploadFile = File(...)` tells FastAPI to expect a multipart file upload named `file`, and `File(...)` marks it as required. The three LangChain imports are done **inside the function** (local imports) rather than at the top — this defers the cost of importing these (sometimes slow) libraries until the first actual upload request, rather than at server startup.

```python
    try:
        global current_document
        global chat_history

        UPLOAD_DIR = "uploads"
        DB_DIR = "db"

        os.makedirs(UPLOAD_DIR, exist_ok=True)
        os.makedirs(DB_DIR, exist_ok=True)
```
Re-declares local versions of the folder path constants (shadowing/duplicating the module-level ones defined earlier) and ensures both folders exist.

```python
        MAX_SIZE = 10 * 1024 * 1024  # 10 MB
        contents = await file.read()

        if len(contents) > MAX_SIZE:
            return {"status": "error", "message": "PDF size exceeds 10 MB."}
```
Reads the entire uploaded file into memory as bytes (`await` because file I/O in FastAPI's `UploadFile` is async), then enforces a 10MB size cap, rejecting larger files with a clear error. **Note:** the file is fully read into memory before checking size — for a stricter guard you'd normally check `Content-Length` header or stream-check size before reading fully, but for a 10MB cap this is a minor/acceptable simplification.

```python
        pdf_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(pdf_path, "wb") as buffer:
            buffer.write(contents)
```
Writes the raw bytes to disk under `uploads/<original filename>`. **Note a real limitation here:** using the raw `file.filename` directly means (a) no sanitization against path traversal (a filename like `../../etc/passwd` isn't checked), and (b) uploading two files with the same name will silently overwrite the first one on disk (though `vectorstores[file.filename]` as a dict key would also just get overwritten/re-point to the new DB path). Good to flag as a known simplification if asked.

```python
        loader = PyPDFLoader(pdf_path)
        docs = loader.load()
        pages = len(docs)
```
`PyPDFLoader` opens the saved PDF and extracts its text. `loader.load()` returns a **list of LangChain `Document` objects, one per page** — each with `.page_content` (the extracted text) and `.metadata` (including the page number). So `len(docs)` conveniently equals the page count.

```python
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=500,
            chunk_overlap=50
        )
        chunks = splitter.split_documents(docs)
        chunk_count = len(chunks)
```
This is where documents get broken into smaller pieces:
- `chunk_size=500` — each chunk targets ~500 characters.
- `chunk_overlap=50` — consecutive chunks share 50 characters of overlap, so a sentence/idea near a chunk boundary doesn't get fully severed and lost from both sides.
- `RecursiveCharacterTextSplitter` tries to split on paragraph breaks first, then sentences, then words — falling back progressively — to keep chunks as semantically coherent as possible rather than cutting text at an arbitrary character count.
- `split_documents(docs)` operates on the page-level `Document` objects and **preserves their metadata** (including page number) onto each resulting chunk — this is exactly why later routes can report `doc.metadata.get("page", 0) + 1`.

**Be ready to justify `chunk_size=500`:** this is fairly small/granular — good for precise retrieval (surfacing exactly the relevant sentence/paragraph) but means each individual chunk carries less surrounding context. Combined with retrieving `k=4` or `k=5` chunks later, the LLM still typically gets ~2000-2500 characters of context per query, which balances precision and coverage.

```python
        embeddings = get_embeddings()

        db_path = os.path.join(DB_DIR, file.filename.replace(".pdf", ""))

        Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=db_path
        )
```
- Gets the (cached, lazily-loaded) embedding model.
- Builds a folder path for this specific document's vector database, named after the file (minus `.pdf`) — e.g., `db/mycontract`.
- `Chroma.from_documents(...)` does the heavy lifting: it takes every chunk, runs it through the embedding model, and writes the resulting vectors + text + metadata into a **new, separate ChromaDB collection on disk at `db_path`**.

**This is the key architectural decision for multi-document support:** each uploaded PDF gets its **own separate ChromaDB folder/collection**, rather than one shared collection with a "document_id" metadata filter. This means retrieval never accidentally mixes chunks from different documents (clean isolation), at the cost of a bit more disk overhead per document and no single "search across everything" without opening multiple stores (which is exactly what `/compare` does manually with two separate `Chroma(...)` instances).

```python
        vectorstores[file.filename] = db_path
        current_document = file.filename

        if current_document not in chat_history:
            chat_history[current_document] = []
```
Registers this document in the global `vectorstores` dict (filename → its db folder path), sets it as the currently active document (so the next chat/summary/etc. call defaults to it), and initializes an empty chat history list for it if one doesn't already exist.

```python
        del docs
        del chunks
        del loader
        del splitter
        del embeddings
        del contents

        import gc
        gc.collect()
```
Explicitly deletes these large local objects (the loaded PDF text, the chunk list, the raw file bytes, the model references) and forces Python's garbage collector to run immediately. This is a deliberate **memory management** choice — since a PDF's full text, all its chunks, and the embedding model can be sizable in memory, and this server likely runs on a memory-constrained environment (e.g., a free-tier deployment), this pattern prevents memory from accumulating across repeated uploads within the same running process. **Be ready to explain:** `del` just removes the local variable reference; `gc.collect()` forces Python's cyclic garbage collector to reclaim memory immediately rather than waiting for it to happen naturally — useful when you know you just created a lot of short-lived objects.

```python
        print("Indexed Documents:", list(vectorstores.keys()))

        return {
            "status": "success",
            "document": file.filename,
            "pages": pages,
            "chunks": chunk_count
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
```
Logs the currently indexed documents to the server console for debugging, then returns a success payload with useful stats (page count, chunk count) for the frontend to display. The `except` block catches **any** exception broadly, prints the full traceback to the server logs (helpful for debugging), and returns a JSON error instead of letting FastAPI's default 500 error page happen — this keeps the API contract consistent (always JSON) even on failure, though it does mean errors always return HTTP 200 with an error field inside, rather than a proper 4xx/5xx status code (a fair critique to acknowledge if asked about REST API design conventions).

---

## 9. `POST /summary`

```python
@app.post("/summary")
async def generate_summary():
    from langchain_community.vectorstores import Chroma
    try:
        global current_document, vectorstores, latest_summary

        if current_document is None:
            return {"summary": "Please select a document first."}
        if current_document not in vectorstores:
            return {"summary": "Document not indexed."}
```
Guards against calling this before any document is uploaded/selected.

```python
        db_path = vectorstores[current_document]
        vectorstore = Chroma(
            persist_directory=db_path,
            embedding_function=get_embeddings()
        )
```
Re-opens the already-persisted ChromaDB folder for the current document from disk (note: this doesn't re-embed anything — it just loads the existing index) and attaches the same embedding function so future queries against it are compatible.

```python
        retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
        docs = retriever.invoke("Provide complete document summary")
```
`.as_retriever(...)` wraps the vector store in LangChain's standard `Retriever` interface. `search_kwargs={"k": 5}` means "return the 5 most similar chunks." The retrieval query here is **not the user's own words** — it's a fixed, generic instruction ("Provide complete document summary") whose embedding is used to fetch 5 chunks that are broadly representative/central to the document. This is a clever trick to reuse the same retrieval mechanism for "give me a summary" without needing a totally different summarization strategy (like map-reduce over the whole document) — though it does mean a **very long document's summary is based on only 5 chunks (~2500 characters)**, not the entire document — a real limitation worth acknowledging.

```python
        context = "\n\n".join(doc.page_content for doc in docs)

        prompt = f"""
You are DocuVerse AI.
Generate a concise but complete summary.
Format exactly:
# Executive Summary
# Key Points
# Important Concepts
# Action Items
Context:
{context}
Summary:
"""
        response = get_llm().invoke(prompt)
        latest_summary = response.content
```
Joins the 5 retrieved chunks into one context blob (separated by blank lines), builds a prompt instructing the LLM to produce a summary in a specific Markdown-style structure, sends it to Groq, and caches the result in the global `latest_summary` (used later by `/export`).

```python
        del docs, context, retriever, vectorstore
        import gc
        gc.collect()

        return {"summary": response.content}

    except Exception as e:
        return {"summary": str(e)}
```
Same memory-cleanup pattern as `/upload`. Note the error handling here is looser than `/upload` — no traceback printed, just the raw exception string returned directly in the `summary` field (a minor inconsistency across routes worth being aware of).

---

## 10. `POST /suggestions`

Structurally identical to `/summary`: loads the vectorstore, retrieves 5 chunks using the fixed query `"Generate useful questions"`, joins them into context, and builds a prompt asking for exactly 5 questions.

```python
        questions = []
        for line in response.content.split("\n"):
            line = line.strip()
            if line:
                line = line.lstrip("-•123456789. ")
                questions.append(line)
```
This is manual **output parsing**: since the LLM returns questions as a plain text block (likely one per line, possibly prefixed with `-`, `•`, or a number like `1.`), this loop splits the response into lines, strips whitespace, skips blank lines, and strips off any leading bullet/numbering characters (`lstrip("-•123456789. ")` removes any combination of those characters from the start of the line) so you get clean question strings.

```python
        return {"questions": questions[:5]}
```
Caps the result to the first 5 in case the LLM returned more or fewer than requested (a defensive slice — good practice since LLMs don't always follow "exactly 5" perfectly).

---

## 11. `POST /query` — The Core Chat Endpoint

```python
@app.post("/query")
async def query_pdf(request: QueryRequest):
```
Takes the Pydantic-validated request body (`{"query": "..."}`).

```python
        retriever = vectorstore.as_retriever(search_kwargs={"k": 4})
        docs = retriever.invoke(request.query)
```
**This time, unlike `/summary`, the retrieval query is the user's actual question** — this is the real RAG retrieval step: embed the user's question, find the 4 nearest chunks in vector space.

```python
        context = "\n\n".join(doc.page_content for doc in docs)

        prompt = f"""
You are DocuVerse AI.
Use ONLY the provided context.
If the answer is partially available, provide the best possible answer.
Only say information is unavailable when the context contains absolutely nothing relevant.
Context:
{context}
Question:
{request.query}
Answer:
"""
        response = get_llm().invoke(prompt)
        answer = response.content
```
This prompt is the anti-hallucination guardrail: it explicitly instructs the model to stick to the given context, but also explicitly allows partial answers rather than refusing outright — a deliberate UX choice favoring helpfulness over strict refusal, with a fallback only when truly nothing relevant was retrieved.

```python
        if current_document not in chat_history:
            chat_history[current_document] = []

        chat_history[current_document].append(
            {"question": request.query, "answer": answer}
        )
```
Appends this Q&A pair into the in-memory, per-document chat history list (which is what `/history` and `/export` later read from).

```python
        sources = []
        seen_pages = set()

        for doc in docs:
            page = doc.metadata.get("page", 0) + 1
            if page not in seen_pages:
                seen_pages.add(page)
                sources.append({"page": page, "preview": doc.page_content[:150]})
```
This builds a **source-attribution list** for the frontend, so users can see which page(s) the answer came from — a lightweight version of "citations." `doc.metadata.get("page", 0)` reads the zero-indexed page number PyPDFLoader stored, `+1` converts it to a human-friendly 1-indexed page number. The `seen_pages` set deduplicates so if 2 of the 4 retrieved chunks came from the same page, that page only appears once in the source list, with just the first chunk's preview text (first 150 characters) shown.

**This directly answers "does your app cite sources?"** — yes, at the page level (not exact sentence/line level), and this is exactly the retrieved-chunk metadata being surfaced back to the user, which is a nice, concrete, correct answer to give in an interview.

```python
        del docs, context, retriever, vectorstore
        import gc
        gc.collect()

        return {"response": answer, "sources": sources}
```

---

## 12. `POST /insights`

Same structural pattern as `/summary` and `/suggestions`: retrieves 5 chunks using the fixed query `"Extract important document insights"`, but this time actually **calls the real `build_insights_prompt(context)` helper** defined earlier (unlike `/summary`, which duplicated its own inline prompt instead of reusing a function) — extracting Dates, People, Organizations, Money, and Risks. Caches result in `latest_insights` for `/export`.

---

## 13. `GET /documents`

```python
@app.get("/documents")
def documents():
    global vectorstores
    return {"documents": list(vectorstores.keys())}
```
Returns the list of currently indexed document filenames — this is what the frontend likely uses to populate a document-picker dropdown/list.

---

## 14. `POST /select-document`

```python
@app.post("/select-document")
async def select_document(request: dict):
    global current_document, vectorstores
    document = request.get("document")

    if document not in vectorstores:
        return {"status": "error", "message": "Document not found"}

    current_document = document
    return {"status": "success", "document": current_document}
```
Note this route accepts a raw `dict` instead of a proper Pydantic model (unlike every other route) — a minor inconsistency (loses automatic validation/schema documentation for this one endpoint). Functionally, it just switches the global `current_document` pointer to a different already-indexed document, so subsequent `/query`, `/summary`, `/insights`, `/search` calls operate on that one instead.

---

## 15. `GET /history`

```python
@app.get("/history")
def get_history():
    global current_document, chat_history

    if current_document is None:
        return {"history": []}

    return {
        "document": current_document,
        "history": chat_history.get(current_document, [])
    }
```
Returns the accumulated `{question, answer}` list for whichever document is currently selected — lets the frontend re-render the conversation (e.g., on page reload, assuming the server itself hasn't restarted, since this is only in-memory).

---

## 16. `POST /followups`

```python
@app.post("/followups")
async def followups(request: QueryRequest):
    prompt = build_followup_prompt(request.query, "placeholder")
    response = get_llm().invoke(prompt)
    return {"followups": response.content.split("\n")}
```
Worth flagging honestly: this passes the literal string `"placeholder"` as the `answer` argument to `build_followup_prompt`, rather than the actual answer that was previously generated for that question. This means the follow-up questions are generated from the user's question alone (with a meaningless placeholder in place of context about the real answer) rather than truly building on the prior Q&A exchange — likely a not-yet-finished feature. Also note the response is just naively split on newlines, without the same bullet-stripping cleanup that `/suggestions` does.

**Good, honest answer if asked:** "This endpoint isn't fully wired up yet — it should be passing the actual answer from the corresponding `/query` call instead of a placeholder string, and I'd clean up the output parsing to match `/suggestions`."

---

## 17. `POST /export`

```python
@app.post("/export")
async def export_report():
    try:
        filename = create_report(
            "DocuVerse_Report.pdf",
            current_document,
            latest_summary,
            latest_insights,
            chat_history.get(current_document, [])
        )
        return {"status": "success", "file": filename}
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"status": "error", "message": str(e)}
```
Calls into `export_service.create_report(...)`, passing: a fixed output filename, the current document's name, the cached summary/insights strings, and that document's chat history list. This function (in the separate file you haven't shown me) presumably uses ReportLab to lay all of this into a formatted PDF and return the resulting filename/path.

---

## 18. `GET /pdf`

```python
@app.get("/pdf")
async def get_pdf():
    global current_document

    if current_document is None:
        return {"error": "No document selected"}

    pdf_path = os.path.join(UPLOAD_DIR, current_document)

    if not os.path.exists(pdf_path):
        return {"error": "PDF not found", "path": os.path.abspath(pdf_path)}

    return FileResponse(pdf_path, media_type="application/pdf")
```
Serves the raw original uploaded PDF file back to the frontend (this is what powers the in-browser PDF viewer feature) — reads it straight from the `uploads/` folder rather than from anywhere in the vector store, since the vector store only holds extracted text chunks, not the original file.

---

## 19. `POST /compare`

```python
@app.post("/compare")
async def compare_documents(request: CompareRequest):
    global vectorstores

    if request.doc1 not in vectorstores:
        return {"comparison": "Document 1 not found."}
    if request.doc2 not in vectorstores:
        return {"comparison": "Document 2 not found."}

    vectorstore1 = Chroma(persist_directory=vectorstores[request.doc1], embedding_function=get_embeddings())
    vectorstore2 = Chroma(persist_directory=vectorstores[request.doc2], embedding_function=get_embeddings())

    retriever1 = vectorstore1.as_retriever(search_kwargs={"k": 4})
    retriever2 = vectorstore2.as_retriever(search_kwargs={"k": 4})

    docs1 = retriever1.invoke("Provide complete document overview")
    docs2 = retriever2.invoke("Provide complete document overview")
```
This is the one route that doesn't rely on the single global `current_document` — it explicitly opens **two separate** ChromaDB stores by name (`doc1`, `doc2`) and retrieves 4 representative chunks from each, independently, again using a fixed generic query rather than anything doc-specific.

```python
    context1 = "\n\n".join(doc.page_content for doc in docs1)
    context2 = "\n\n".join(doc.page_content for doc in docs2)

    prompt = f"""
You are DocuVerse AI.
Compare these documents.
Document A:
{request.doc1}
{context1}
Document B:
{request.doc2}
{context2}
Provide:
1. Key Differences
2. Missing Clauses
3. Risks
4. Recommendations
5. Overall Similarity
"""
    response = get_llm().invoke(prompt)
```
Builds a single prompt containing both documents' representative context side by side, labeled Document A / Document B, and asks the LLM to synthesize a structured comparison across 5 specific dimensions (notably "Missing Clauses" — a strong hint this project was partly designed with contracts/legal documents in mind).

```python
    del docs1, docs2, context1, context2, retriever1, retriever2, vectorstore1, vectorstore2
    import gc
    gc.collect()

    return {"comparison": response.content}
```
Same memory cleanup pattern, just doubled since two vector stores were opened.

---

## 20. `POST /search`

```python
@app.post("/search")
async def search_document(request: SearchRequest):
    if current_document not in vectorstores:
        return {"results": []}

    vectorstore = Chroma(persist_directory=vectorstores[current_document], embedding_function=get_embeddings())
    retriever = vectorstore.as_retriever(search_kwargs={"k": 5})
    docs = retriever.invoke(request.query)

    results = []
    for doc in docs:
        results.append({
            "page": doc.metadata.get("page", 0) + 1,
            "snippet": doc.page_content[:250]
        })

    return {"results": results}
```
This is the "pure retrieval, no generation" feature — semantic search. Notice it **does not call `get_llm()` at all** — it just returns the raw top-5 matching chunks (page number + a 250-character snippet) directly to the frontend. This is the clearest, simplest example to point to when explaining "what's the difference between retrieval and generation" in an interview — this route *is* the retrieval step, isolated and exposed on its own.

---

## 21. `GET /test-groq`

```python
@app.get("/test-groq")
def test_groq():
    try:
        llm = get_llm()
        response = llm.invoke("Reply with only the word HELLO")
        return {"success": True, "response": response.content}
    except Exception as e:
        return {"success": False, "error": str(e)}
```
A diagnostic/debugging endpoint — confirms the Groq API key is valid and the LLM is reachable, independent of any RAG logic. Useful during development to isolate "is my LLM connection broken" from "is my retrieval broken."

---

## 22. Server Entrypoint

```python
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
```
Lets you run the server directly via `python main1.py` (in addition to the more common `uvicorn backend.main1:app --reload` command) — `host="127.0.0.1"` restricts it to local-machine-only access (not exposed on your network), `port=8000` is the standard dev port.

---

## Summary Table: Every Route

| Route | Method | Uses LLM? | Uses Retrieval? | Notes |
|---|---|---|---|---|
| `/` | GET | No | No | Health check |
| `/upload` | POST | No | No (indexes only) | Full ingestion pipeline |
| `/summary` | POST | Yes | Yes (k=5, fixed query) | Caches to `latest_summary` |
| `/suggestions` | POST | Yes | Yes (k=5, fixed query) | Manual output parsing |
| `/query` | POST | Yes | Yes (k=4, user's query) | Core chat + source citations |
| `/insights` | POST | Yes | Yes (k=5, fixed query) | Uses the real helper function |
| `/documents` | GET | No | No | Lists indexed docs |
| `/select-document` | POST | No | No | Switches active document |
| `/history` | GET | No | No | Reads in-memory chat log |
| `/followups` | POST | Yes | No | Not fully wired (placeholder bug) |
| `/export` | POST | No | No | Delegates to ReportLab service |
| `/pdf` | GET | No | No | Serves raw original file |
| `/compare` | POST | Yes | Yes (k=4 each, two docs) | Only route not using `current_document` |
| `/search` | POST | No | Yes (k=5, user's query) | Pure retrieval, no generation |
| `/test-groq` | GET | Yes | No | LLM connectivity check |

---

## Talking Points This Code Gives You (use these verbatim if needed)

1. **"Each document gets its own ChromaDB collection on disk"** — clean isolation, easy to point to in `/upload`.
2. **"I use a fixed generic query to drive summary/insights/suggestions retrieval, rather than retrieving the whole document"** — be ready to admit this means summaries are based on a sample (5 chunks), not the full text, and that's a known trade-off.
3. **"`/query` includes source attribution by page number, deduplicated"** — a genuinely nice detail, know it cold.
4. **"State is currently all in-process global variables — no database, no per-user session, lost on restart"** — the single most important honest limitation to volunteer.
5. **"`/search` is pure retrieval with no LLM call — it's the clearest example of the 'R' in RAG standing alone."**
6. **"I explicitly `del` and `gc.collect()` after heavy operations"** — shows awareness of memory constraints, good to mention if asked about running this on limited hardware (e.g., a free-tier host).
7. **Known rough edges, own them proactively:** unused imports (`context`, `shutil`), a couple of unused prompt-builder functions superseded by inline prompts, `/followups` not fully wired (placeholder answer), `/select-document` skipping Pydantic validation, `CORS allow_origins=["*"]`, no filename sanitization on upload.
