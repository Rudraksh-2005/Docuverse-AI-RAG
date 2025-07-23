# main.py

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests  # <-- This lets us call Ollama API

# FastAPI app setup
app = FastAPI()

# CORS setup so frontend can access backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the data model
class QueryRequest(BaseModel):
    query: str

# API endpoint
@app.post("/query")
async def process_query(request: QueryRequest):
    try:
        print(f"[INFO] Received query: {request.query}")

        # Send request to local Ollama server running Mistral
        payload = {
            "model": "mistral",  # You can switch to tinyllama for testing
            "prompt": request.query,
            "stream": False
        }

        response = requests.post("http://localhost:11434/api/generate", json=payload)
        response.raise_for_status()

        result = response.json()
        print(f"[INFO] Ollama response: {result['response']}")
        return {"response": result["response"]}

    except Exception as e:
        print(f"[ERROR] {e}")
        return {"response": f"Error: {e}"}

# Start server
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
