from typing import List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel
from app.models.domain import Document, DocumentChunk, Case

class DocumentDetailResponse(BaseModel):
    document: Document
    chunks: List[DocumentChunk]

class CaseListResponse(BaseModel):
    id: UUID
    name: str
    domain: str
    created_at: datetime
    documents: List[Document]
