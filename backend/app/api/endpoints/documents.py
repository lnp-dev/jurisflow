from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from uuid import UUID
from typing import List

from app.core.database import get_session, engine
from app.models.domain import Document, Case, DocumentChunk
from app.services.ingestion import process_document
from app.services.graphrag import build_graph_for_case
from app.schemas.responses import DocumentDetailResponse
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

@router.get("/cases/{case_id}/documents", response_model=List[Document])
def list_documents(
    case_id: UUID,
    session: Session = Depends(get_session)
):
    stmt = select(Document).where(Document.case_id == case_id)
    results = session.exec(stmt).all()
    return results

@router.get("/cases/{case_id}/documents/{document_id}", response_model=DocumentDetailResponse)
def get_document_details(
    case_id: UUID,
    document_id: UUID,
    session: Session = Depends(get_session)
):
    doc = session.get(Document, document_id)
    if not doc or doc.case_id != case_id:
        raise HTTPException(status_code=404, detail="Document not found")
    
    stmt = select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    chunks = session.exec(stmt).all()
    
    return DocumentDetailResponse(document=doc, chunks=chunks)

from app.core.graph import neo4j_conn

@router.delete("/cases/{case_id}/documents/{document_id}")
def delete_document(
    case_id: UUID,
    document_id: UUID,
    session: Session = Depends(get_session)
):
    doc = session.get(Document, document_id)
    if not doc or doc.case_id != case_id:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Gather chunks before deletion so we can remove them from the graph
    chunk_stmt = select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    chunks = session.exec(chunk_stmt).all()
    chunk_ids = [str(c.id) for c in chunks]
    
    # 1. Delete chunks from Postgres
    for c in chunks:
        session.delete(c)
        
    # 2. Delete physical file
    if os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except Exception as e:
            print(f"Warning: Failed to delete physical file {doc.file_path}: {e}")
            
    # 3. Clean up the Graph (Neo4j)
    if chunk_ids:
        try:
            with neo4j_conn.get_session() as neo_session:
                # 3a. Remove extracted chunk_ids from source lists on all Nodes and Relationships
                # using list comprehension in Cypher
                scrub_query = """
                MATCH (n {case_id: $case_id})-[r]-(m {case_id: $case_id})
                SET n.source_chunk_ids = [cid IN n.source_chunk_ids WHERE NOT cid IN $chunk_ids]
                SET m.source_chunk_ids = [cid IN m.source_chunk_ids WHERE NOT cid IN $chunk_ids]
                SET r.source_chunk_ids = [cid IN r.source_chunk_ids WHERE NOT cid IN $chunk_ids]
                """
                neo_session.run(scrub_query, case_id=str(case_id), chunk_ids=chunk_ids)
                
                # 3b. Delete orphaned Relationships (where source list is empty)
                del_edges_query = """
                MATCH (n {case_id: $case_id})-[r]-(m {case_id: $case_id})
                WHERE size(r.source_chunk_ids) = 0 OR r.source_chunk_ids IS NULL
                DELETE r
                """
                neo_session.run(del_edges_query, case_id=str(case_id))
                
                # 3c. Delete orphaned Nodes (where source list is empty AND no relationships exist)
                # Note: Nodes might have an empty source list but still act as a bridge, 
                # but typically if no sources remain, they should go.
                del_nodes_query = """
                MATCH (n {case_id: $case_id})
                WHERE (size(n.source_chunk_ids) = 0 OR n.source_chunk_ids IS NULL)
                AND NOT (n)--()
                DELETE n
                """
                neo_session.run(del_nodes_query, case_id=str(case_id))
        except Exception as e:
            print(f"Error cleaning up Neo4j Graph for document {document_id}: {e}")

    # 4. Delete from Postgres
    session.delete(doc)
    session.commit()
    
    return {"status": "deleted", "document_id": document_id}

@router.post("/cases/{case_id}/build-graph")
def build_graph(
    case_id: UUID,
    session: Session = Depends(get_session)
):
    result = build_graph_for_case(session, case_id)
    return result
