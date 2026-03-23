from typing import Optional, Any
from uuid import UUID, uuid4
from datetime import datetime
from sqlmodel import Field, SQLModel, JSON
from sqlalchemy import Column
from pydantic import BaseModel

class Case(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    name: str = Field(index=True)
    domain: str = Field(default="M&A")
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Document(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: UUID = Field(foreign_key="case.id")
    filename: str
    file_path: str
    status: str = Field(default="uploaded")  # uploaded, parsed, redacted, graph_built

class DocumentChunk(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    document_id: UUID = Field(foreign_key="document.id")
    raw_text: str
    redacted_text: Optional[str] = None
    page_number: Optional[int] = None
    bounding_box: Optional[list[float]] = Field(default=None, sa_column=Column(JSON))

class RedactionDictionary(SQLModel, table=True):
    id: UUID = Field(default_factory=uuid4, primary_key=True)
    case_id: UUID = Field(foreign_key="case.id")
    original_text: str
    redacted_token: str
    entity_type: str
