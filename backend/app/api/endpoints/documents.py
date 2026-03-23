from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session
from uuid import UUID
from typing import List

from app.core.database import get_session, engine
from app.models.domain import Document, Case
from app.services.ingestion import process_document
import os
import shutil

def session_factory():
    return Session(engine)

router = APIRouter()

@router.post("/cases/{case_id}/documents")
def upload_document(
    case_id: UUID, 
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    session: Session = Depends(get_session)
):
    # Create upload directory if it doesn't exist
    upload_dir = "uploads"
    import os
    import shutil
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
    
    # Run ingestion in a background task
    background_tasks.add_task(process_document, session_factory, case_id, doc.id)
    
    return {"status": "received", "document_id": doc.id, "message": "Processing in background"}

@router.post("/cases/{case_id}/build-graph")
def build_graph(
    case_id: UUID,
    session: Session = Depends(get_session)
):
    result = build_graph_for_case(session, case_id)
    return result
