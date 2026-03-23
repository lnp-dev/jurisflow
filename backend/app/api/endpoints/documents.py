from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlmodel import Session
from uuid import UUID
from typing import List

from app.core.database import get_session
from app.models.domain import Document, Case
from app.services.ingestion import process_document
from app.services.graphrag import build_graph_for_case
import os
import shutil

router = APIRouter()

@router.post("/cases/{case_id}/documents")
async def upload_document(
    case_id: UUID, 
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    # Create upload directory if it doesn't exist
    upload_dir = "uploads"
    os.makedirs(upload_dir, exist_ok=True)
    
    file_path = os.path.join(upload_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    # See if case exists
    case = session.get(Case, case_id)
    if not case:
        case = Case(id=case_id, name=f"Case {case_id}")
        session.add(case)
        session.commit()
        
    doc = Document(
        case_id=case_id,
        filename=file.filename,
        file_path=file_path,
        status="uploaded"
    )
    session.add(doc)
    session.commit()
    
    # For a real app, consider running this in a background task
    try:
        process_document(session, doc)
    except Exception as e:
        print(f"Error processing: {e}")
        doc.status = "error"
        session.add(doc)
        session.commit()
    
    return {"status": "received_and_processed", "document_id": doc.id, "final_status": doc.status}

@router.post("/cases/{case_id}/build-graph")
async def build_graph(
    case_id: UUID,
    session: Session = Depends(get_session)
):
    result = build_graph_for_case(session, case_id)
    return result
