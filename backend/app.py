#Dependencies
import sys
import os
import io
import asyncio
import pdfplumber
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from gliner import GLiNER
from sqlalchemy.orm import Session
from database.models import EntityMap #SQL Table
from core.processor import LegalProcessor


sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'core')))

try:
    import juris_core
except ImportError as e:
    print(f"Error importing juris_core module: {e}")
    raise


app = FastAPI(title='JurisFlow Backend API')
# --- CORS CONFIGURATION ---
# Configure Cross-Origin Resource Sharing (CORS) to allow the React frontend
# to communicate with this FastAPI backend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def extract_text_from_pdf_bytes(pdf_bytes) -> str:
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        raw_text_list = []
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text is not None:
                raw_text_list.append(page_text)
        raw_text = "\n".join(raw_text_list)
    return raw_text


# --- ENDPOINTS ---

@app.get('/')
def home():
    return {'status': 'System is healthy.', 'model_version': '1.0'}
'''
def redact_pii_from_text(text: str) -> str:
    # Use the juris_core PiiMasker to redact PII with obvious structure from the text
    redacted_text = masker.mask_sensitive_pii(text)

    #Use GLiNER to redact context-dependent PII

    return redacted_text
'''



@app.post("/process-pdf/")
async def process_document(file: UploadFile = File(...)):
    """Process uploaded PDF file and return extracted text with PII redacted."""

    if file.content_type != 'application/pdf':
        return {"error": "Invalid file type. Please upload a PDF file."}

    pdf_bytes = await file.read()

    raw_text = extract_text_from_pdf_bytes(pdf_bytes)

    redacted_text = redact_pii_from_text(raw_text)
    
    return {"redacted_text": redacted_text}








