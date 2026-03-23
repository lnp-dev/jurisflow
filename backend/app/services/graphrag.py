from uuid import UUID
from sqlmodel import Session, select
from pydantic import BaseModel, Field
from typing import List, Optional
import json

from app.models.domain import DocumentChunk, Document
from app.core.config import settings
from app.core.graph import get_neo4j_session

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

# Structured Output Models for Gemini
class Node(BaseModel):
    id: str = Field(description="Unique identifier for the node")
    label: str = Field(description="One of: Company, Agreement, Clause, Asset, Person, Jurisdiction")
    properties: dict = Field(description="Key-value pairs of properties extracted")
    source_chunk_ids: List[str] = Field(description="IDs of the text chunks where this entity was found", default_factory=list)

class Edge(BaseModel):
    source_id: str = Field(description="ID of the source node")
    target_id: str = Field(description="ID of the target node")
    type: str = Field(description="One of: ACQUIRES, GOVERNS, CONTAINS_CLAUSE, OWNS_ASSET, etc.")
    properties: dict = Field(description="Optional edge properties like date or relationship details")
    source_chunk_ids: List[str] = Field(description="IDs of the text chunks where this relationship was found", default_factory=list)

class GraphData(BaseModel):
    nodes: List[Node]
    edges: List[Edge]

client = genai.Client(api_key=settings.GEMINI_API_KEY) if genai and settings.GEMINI_API_KEY else None

def build_graph_for_case(session: Session, case_id: UUID):
    # 1. Fetch Data
    stmt = select(DocumentChunk).where(
        DocumentChunk.document_id == Document.id,
        Document.case_id == case_id
    )
    chunks = session.exec(stmt).all()
    
    if not chunks:
        return {"status": "no_chunks_found"}
        
    combined_text = ""
    for c in chunks:
        if c.redacted_text:
            combined_text += f"[CHUNK_ID: {c.id}]\n{c.redacted_text}\n\n"
    
    if not client:
        print("Gemini API not configured")
        return {"status": "gemini_unavailable"}
        
    # 2. LLM Call (Gemini API)
    prompt = f"""
    You are an expert legal M&A knowledge graph extractor.
    Analyze the following fully redacted document text and extract a knowledge graph.
    The nodes can only have the following labels: Company, Agreement, Clause, Asset, Person, Jurisdiction.
    The edges should represent relationships like ACQUIRES, GOVERNS, CONTAINS_CLAUSE, OWNS_ASSET.
    
    Extract the entities and relationships exactly as they appear in the text, preserving any redacted tokens (e.g. [ORG_1]).
    For every Node and Edge you extract, you MUST include the CHUNK_ID(s) it was derived from in the `source_chunk_ids` list.
    
    Text:
    {combined_text[:30000]} # Truncating for safety in example
    """
    
    response = client.models.generate_content(
        model='gemini-3.1-pro',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=GraphData,
            temperature=0.1
        ),
    )
    
    try:
        graph_data: GraphData = GraphData.model_validate_json(response.text)
    except Exception as e:
        print(f"Error parsing Gemini response: {e}")
        return {"status": "parsing_error"}
        
    # 3. Graph Injection
    neo4j_session_gen = get_neo4j_session()
    neo_session = next(neo4j_session_gen)
    
    try:
        # Create Nodes
        for node in graph_data.nodes:
            # Note: Cypher injection should be handled carefully, here we use parameters
            query = (
                f"MERGE (n:{node.label} {{id: $id, case_id: $case_id}}) "
                "SET n += $props, n.source_chunk_ids = $sources"
            )
            neo_session.run(query, id=node.id, case_id=str(case_id), props=node.properties, sources=node.source_chunk_ids)
            
        # Create Edges
        for edge in graph_data.edges:
            query = (
                f"MATCH (source {{id: $source_id, case_id: $case_id}}) "
                f"MATCH (target {{id: $target_id, case_id: $case_id}}) "
                f"MERGE (source)-[r:{edge.type}]->(target) "
                "SET r += $props, r.source_chunk_ids = $sources"
            )
            neo_session.run(
                query, 
                source_id=edge.source_id, 
                target_id=edge.target_id, 
                case_id=str(case_id),
                props=edge.properties,
                sources=edge.source_chunk_ids
            )
            
        # Update Document status
        doc_stmt = select(Document).where(Document.case_id == case_id)
        docs = session.exec(doc_stmt).all()
        for doc in docs:
            doc.status = "graph_built"
            session.add(doc)
            
        session.commit()
    finally:
        neo_session.close()
        
    return {"status": "graph_built", "nodes": len(graph_data.nodes), "edges": len(graph_data.edges)}
