from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List
import os
from uuid import UUID
from app.core.database import get_session
from app.models.domain import Case, Document, DocumentChunk, RedactionDictionary
from app.schemas.responses import CaseListResponse
from app.core.graph import neo4j_conn

router = APIRouter()

@router.get("/cases", response_model=List[CaseListResponse])
def list_cases(session: Session = Depends(get_session)):
    stmt = select(Case)
    cases = session.exec(stmt).all()
    # SQLModel relationships allow us to access .documents directly
    return [
        CaseListResponse(
            id=c.id,
            name=c.name,
            domain=c.domain,
            created_at=c.created_at,
            documents=c.documents
        ) for c in cases
    ]

@router.delete("/cases/{case_id}")
def delete_case(case_id: UUID, session: Session = Depends(get_session)):
    case = session.get(Case, case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
        
    # 1. Delete Documents and their Files/Chunks
    doc_stmt = select(Document).where(Document.case_id == case_id)
    documents = session.exec(doc_stmt).all()
    for doc in documents:
        # Delete chunks
        chunk_stmt = select(DocumentChunk).where(DocumentChunk.document_id == doc.id)
        chunks = session.exec(chunk_stmt).all()
        for c in chunks:
            session.delete(c)
        # Delete physical file
        if os.path.exists(doc.file_path):
            os.remove(doc.file_path)
        session.delete(doc)
        
    # 2. Delete Redaction Dictionary
    dict_stmt = select(RedactionDictionary).where(RedactionDictionary.case_id == case_id)
    dicts = session.exec(dict_stmt).all()
    for d in dicts:
        session.delete(d)
        
    # 3. Delete Case
    session.delete(case)
    session.commit()
    
    # 4. Delete Neo4j Graph
    try:
        with neo4j_conn.get_session() as neo_session:
            # We filter by case_id property that was set during build-graph
            neo_session.run("MATCH (n {case_id: $case_id}) DETACH DELETE n", case_id=str(case_id))
    except Exception as e:
        print(f"Non-critical: Neo4j cleanup failed: {e}")
        
    return {"status": "deleted", "case_id": case_id}
