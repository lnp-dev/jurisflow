#Dependencies
import sys
import os
import io
import asyncio
import pdfplumber
from datetime import datetime
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from gliner import GLiNER
from sqlalchemy.orm import Session
 #SQL Table
from core.processor import LegalProcessor


sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'core')))




app = FastAPI(title='JurisFlow API')
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


class CaseCreate(BaseModel):
    name: str = Field(..., max_length=100)

    class Config:
        from_attributes = True
        str_strip_whitespace = True
        extra = 'forbid'

class CasePublic(BaseModel):
    id: int
    case_id: int
    name: str
    created_at: datetime
    
    class Config:
        from_attributes = True
        str_strip_whitespace = True
        extra = 'forbid'

class DocumentPublic(BaseModel):
    id: int
    case_id: int
    filename: str
    upload_date: datetime

    class Config:
        from_attributes = True
        str_strip_whitespace = True
        extra = 'forbid'

# --- ENDPOINTS ---

@app.get('/')
def home():
    return {'name': 'JurisFlow API', 'status': 'healthy', 'model_version': '1.0'}

@app.post('/cases')
def create_case(case: CaseCreate):
    # Logic to create a new case
    pass 

@app.get('/cases/{case_id}')
def get_case(case_id: int):
    # Logic to get a case by ID
    pass

@app.post('/cases/{case_id}/upload')
async def upload_document(case_id: int):
    # Logic to upload a document to a case
    pass

@app.get('/cases/{case_id}/documents/{document_id}')
def get_document(case_id: int, document_id: int):
    # Logic to get a document by ID within a case
    pass


'''
@app.post("/")
async def upload_pdf(file: UploadFile = File(...)):
    """Process uploaded PDF file and return extracted text with PII redacted."""

    if file.content_type != 'application/pdf':
        return {"error": "Invalid file type. Please upload a PDF file."}

    pdf_bytes = await file.read()

    raw_text = extract_text_from_pdf_bytes(pdf_bytes)

    redacted_text = redact_pii_from_text(raw_text)
    
    return {"redacted_text": redacted_text}

'''







