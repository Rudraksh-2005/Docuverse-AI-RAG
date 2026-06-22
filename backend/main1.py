print("RUNNING BACKEND MAIN.PY")
from multiprocessing import context
import os
import shutil
import uvicorn

from dotenv import load_dotenv
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.services.export_service import create_report

from fastapi.responses import FileResponse

load_dotenv()


# from services.rag_services import (
#     get_embeddings,
#     load_vectorstore
# )

# from services.summary_services import (
#     build_summary_prompt
# )

# from services.suggestion_service import (
#     build_suggestion_prompt
# )

# from services.insights_service import (
#     build_insights_prompt
# )


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

def build_suggestion_prompt(context):
    return f"""
    Generate 5 useful questions.

    {context}
    """

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

def build_followup_prompt(
    question,
    answer
):
    return f"""
Generate 3 useful follow-up questions.

Question:
{question}

Answer:
{answer}

Return only questions.
"""

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter

from langchain_groq import ChatGroq

# =====================================================
# APP CONFIG
# =====================================================

app = FastAPI(title="DocuVerse AI")
print("APP STARTED")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

VECTOR_STORE_DIR = "db"
UPLOAD_DIR = "uploads"

os.makedirs(
    UPLOAD_DIR,
    exist_ok=True
)


vectorstore = None

current_document = None

chat_history = {}

latest_summary = ""
latest_insights = ""


# =====================================================
# MODELS
# =====================================================

class QueryRequest(BaseModel):
    query: str


class CompareRequest(BaseModel):

    doc1: str
    doc2: str


class SearchRequest(BaseModel):

    query:str

# =====================================================
# HELPERS
# =====================================================

def get_embeddings():

    return HuggingFaceEmbeddings(
        model_name="sentence-transformers/all-MiniLM-L6-v2"
    )


llm = ChatGroq(
    model="llama-3.1-8b-instant",
    temperature=0.3,
    api_key=os.getenv("GROQ_API_KEY")
)

def get_llm():
    return llm


# =====================================================
# HOME
# =====================================================

@app.get("/")
def home():
    return {
        "status": "running",
        "name": "DocuVerse AI"
    }


# =====================================================
# UPLOAD PDF
# =====================================================


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):

    
    from langchain_huggingface import HuggingFaceEmbeddings
    from langchain_community.vectorstores import Chroma

    try:

        global vectorstore
        global current_document
        global chat_history

        UPLOAD_DIR = "uploads"

        os.makedirs(
            UPLOAD_DIR,
            exist_ok=True
        )

        pdf_path = os.path.join(
            UPLOAD_DIR,
            file.filename
        )

        # overwrite existing file safely
        with open(
            pdf_path,
            "wb"
        ) as buffer:

            shutil.copyfileobj(
                file.file,
                buffer
            )

        loader = PyPDFLoader(
            pdf_path
        )

        docs = loader.load()

        splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,
            chunk_overlap=200
        )

        chunks = splitter.split_documents(
            docs
        )

        embeddings = get_embeddings()

        # Separate DB for each PDF
        db_path = os.path.join(
            "db",
            file.filename.replace(
                ".pdf",
                ""
            )
        )

        os.makedirs(
            "db",
            exist_ok=True
        )

        vectorstore = Chroma.from_documents(
            documents=chunks,
            embedding=embeddings,
            persist_directory=db_path
        )

        current_document = file.filename
        print(
            "ALL DOCUMENTS:",
            list(vectorstores.keys())
        )

        current_document = file.filename

        if current_document not in chat_history:

            chat_history[current_document] = []

        return {
            "status": "success",
            "document": file.filename,
            "pages": len(docs),
            "chunks": len(chunks)
        }

    except Exception as e:

        return {
            "status": "error",
            "message": str(e)
        }




# =====================================================
# SUMMARY
# =====================================================

@app.post("/summary")
async def generate_summary():

    try:

        global current_document
        global vectorstores
        global latest_summary

        if current_document is None:

            return {
                "summary":
                "Please select a document first."
            }

        if current_document not in vectorstores:

            return {
                "summary":
                "Document not indexed."
            }

        vectorstore = vectorstores[
            current_document
        ]

        retriever = vectorstore.as_retriever(
            search_kwargs={"k": 15}
        )

        docs = retriever.invoke(
            "Provide complete document summary"
        )

        context = "\n\n".join(
            [doc.page_content for doc in docs]
        )

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

        response = get_llm().invoke(
            prompt
        )

        latest_summary = response.content

        print("\nCURRENT DOC:")
        print(current_document)

        return {
            "summary":
            response.content
        }

    except Exception as e:

        return {
            "summary":
            str(e)
        }

# =====================================================
# SUGGESTED QUESTIONS
# =====================================================

@app.post("/suggestions")
async def suggested_questions():

    try:

        global vectorstore

        if vectorstore is None:

            return {
                "questions": []
            }

        retriever = vectorstore.as_retriever(
            search_kwargs={"k": 10}
        )

        docs = retriever.invoke(
            "Generate useful questions"
        )

        context = "\n\n".join(
            [doc.page_content for doc in docs]
        )

        prompt = f"""
You are DocuVerse AI.

Generate exactly 5 useful questions
a user might ask about this document.

Return ONLY questions.

Document:

{context}
"""

        response = get_llm().invoke(prompt)

        questions = []

        for line in response.content.split("\n"):

            line = line.strip()

            if line:
                line = line.lstrip("-•123456789. ")
                questions.append(line)

        return {
            "questions": questions[:5]
        }

    except Exception as e:

        return {
            "questions": [str(e)]
        }



# =====================================================
# Query PDF
# =====================================================

@app.post("/query")
async def query_pdf(request: QueryRequest):

    global current_document
    global vectorstores
    global chat_history

    if current_document is None:

        return {
            "response": "Please select a document first."
        }

    if current_document not in vectorstores:

        return {
            "response": "Document not indexed."
        }

    vectorstore = vectorstores[current_document]

    retriever = vectorstore.as_retriever(
        search_kwargs={"k": 8}
    )

    docs = retriever.invoke(
        request.query
    )

    # DEBUG
    print("\nQUESTION:")
    print(request.query)

    print("\nTOP CHUNKS:")

    for i, doc in enumerate(docs[:3]):

        print(f"\nChunk {i+1}")

        print(
            doc.page_content[:500]
        )

    context = "\n\n".join(
        [
            doc.page_content
            for doc in docs
        ]
    )

    prompt = f"""
You are DocuVerse AI.

Use ONLY the provided context.

If the answer is partially available,
provide the best possible answer.

Only say information is unavailable
when the context contains absolutely
nothing relevant.

Context:
{context}

Question:
{request.query}

Answer:
"""

    response = get_llm().invoke(
        prompt
    )

    answer = response.content

    if current_document not in chat_history:

        chat_history[current_document] = []

    chat_history[current_document].append(
        {
            "question": request.query,
            "answer": answer
        }
    )

    sources = []

    seen_pages = set()

    for doc in docs:

        page = (
            doc.metadata.get(
                "page",
                0
            ) + 1
        )

        if page not in seen_pages:

            seen_pages.add(page)

            sources.append(
                {
                    "page": page,
                    "preview":
                    doc.page_content[:150]
                }
            )

    return {
        "response": answer,
        "sources": sources
    }


# =====================================================
# DOCUMENTS INSIGHTS
# =====================================================
@app.post("/insights")
async def insights():

    try:

        global current_document
        global vectorstores
        global latest_insights

        if current_document is None:

            return {
                "insights":
                "Please select a document first."
            }

        if current_document not in vectorstores:

            return {
                "insights":
                "Document not indexed."
            }

        vectorstore = vectorstores[
            current_document
        ]

        retriever = vectorstore.as_retriever(
            search_kwargs={"k": 10}
        )

        docs = retriever.invoke(
            "Extract important document insights"
        )

        context = "\n\n".join(
            [
                doc.page_content
                for doc in docs
            ]
        )

        prompt = build_insights_prompt(
            context
        )

        response = get_llm().invoke(
            prompt
        )
        latest_insights = response.content

        return {
            "insights":
            response.content
        }

    except Exception as e:

        return {
            "insights": str(e)
        }

# =====================================================
# LIST DOCUMENTS
# =====================================================
@app.get("/documents")
def documents():

    global vectorstores

    return {
        "documents":
        list(
            vectorstores.keys()
        )
    }

# =====================================================
# Document selection
# =====================================================
@app.post("/select-document")
async def select_document(
    request: dict
):

    global current_document
    global vectorstores

    document = request.get(
        "document"
    )

    if document not in vectorstores:

        return {
            "status": "error",
            "message":
            "Document not found"
        }

    current_document = document

    return {
        "status": "success",
        "document":
        current_document
    }

# =====================================================
# CHAT HISTORY
# =====================================================

@app.get("/history")
def get_history():

    global current_document
    global chat_history

    if current_document is None:

        return {
            "history": []
        }

    return {
        "document": current_document,
        "history": chat_history.get(
            current_document,
            []
        )
    }


# =====================================================
# FOLLOWUPS
# =====================================================


@app.post("/followups")
async def followups(request: QueryRequest):

    prompt = build_followup_prompt(
        request.query,
        "placeholder"
    )

    response = get_llm().invoke(
        prompt
    )

    return {
        "followups":
        response.content.split("\n")
    }


# =====================================================
# EXPORT 
# =====================================================
@app.post("/export")
async def export_report():

    try:

        global current_document
        global latest_summary
        global latest_insights
        global chat_history

        filename = create_report(
            "DocuVerse_Report.pdf",
            current_document,
            latest_summary,
            latest_insights,
            chat_history.get(
                current_document,
                []
            )
        )

        return {
            "status": "success",
            "file": filename
        }

    except Exception as e:

        import traceback

        traceback.print_exc()

        return {
            "status": "error",
            "message": str(e)
        }

# =====================================================
# PDF
# =====================================================
from fastapi.responses import FileResponse
@app.get("/pdf")
async def get_pdf():


    global current_document

    if current_document is None:

        return {
            "error":
            "No document selected"
        }

    pdf_path = os.path.join(
        UPLOAD_DIR,
        current_document
    )

    if not os.path.exists(
        pdf_path
    ):

        return {
            "error":
            "PDF not found",
            "path":
            os.path.abspath(
                pdf_path
            )
        }

    return FileResponse(
        pdf_path,
        media_type="application/pdf"
    )

# =====================================================
# COMPARE DOCUMENTS
# =====================================================


@app.post("/compare")
async def compare_documents(
    request: CompareRequest
):

    global vectorstores

    if request.doc1 not in vectorstores:

        return {
            "comparison":
            "Document 1 not found."
        }

    if request.doc2 not in vectorstores:

        return {
            "comparison":
            "Document 2 not found."
        }

    retriever1 = vectorstores[
        request.doc1
    ].as_retriever(
        search_kwargs={"k": 8}
    )

    retriever2 = vectorstores[
        request.doc2
    ].as_retriever(
        search_kwargs={"k": 8}
    )

    docs1 = retriever1.invoke(
        "Provide complete document overview"
    )

    docs2 = retriever2.invoke(
        "Provide complete document overview"
    )

    context1 = "\n\n".join(
        [
            doc.page_content
            for doc in docs1
        ]
    )

    context2 = "\n\n".join(
        [
            doc.page_content
            for doc in docs2
        ]
    )

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

    response = get_llm().invoke(
        prompt
    )

    return {
        "comparison":
        response.content
    }


# =====================================================
# SEARCH
# =====================================================


@app.post("/search")
async def search_document(
    request: SearchRequest
):

    global current_document
    global vectorstores

    if current_document not in vectorstores:

        return {
            "results":[]
        }

    vectorstore = vectorstores[current_document]

    retriever = vectorstore.as_retriever(
        search_kwargs={"k":10}
    )

    docs =retriever.invoke(
        request.query
    )

    results=[]

    for doc in docs:

        results.append(
            {
                "page":
                doc.metadata.get(
                    "page",
                    0
                ) + 1,

                "snippet":
                doc.page_content[:250]
            }
        )

    return {
        "results":
        results
    }

# =====================================================
# RUN SERVER
# =====================================================

if __name__ == "__main__":

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )