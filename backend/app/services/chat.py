import re
from uuid import UUID
from sqlmodel import Session, select
from typing import List, Dict, Any

from app.models.domain import RedactionDictionary, DocumentChunk
from app.core.config import settings
from app.core.graph import get_neo4j_session

try:
    from google import genai
    from google.genai import types
except ImportError:
    genai = None

from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

client = genai.Client(api_key=settings.GEMINI_API_KEY) if genai and settings.GEMINI_API_KEY else None

def scrub_prompt(session: Session, case_id: UUID, prompt: str) -> str:
    dict_stmt = select(RedactionDictionary).where(RedactionDictionary.case_id == case_id)
    redaction_dicts = session.exec(dict_stmt).all()
    
    registry = analyzer.registry
    operators = {}
    
    for rd in redaction_dicts:
        pattern = Pattern(name=rd.redacted_token, regex=re.escape(rd.original_text), score=1.0)
        recognizer = PatternRecognizer(supported_entity=rd.entity_type, patterns=[pattern])
        registry.add_recognizer(recognizer)
        operators[rd.entity_type] = OperatorConfig("replace", {"new_value": rd.redacted_token})
        
    results = analyzer.analyze(text=prompt, language='en')
    anonymized = anonymizer.anonymize(
        text=prompt,
        analyzer_results=results,
        operators=operators
    )
    
    return anonymized.text

def ask_question(session: Session, case_id: UUID, redacted_prompt: str) -> dict:
    if not client:
        return {"answer": "Gemini API not configured", "citations": []}
        
    # 1. Graph Retrieval (Targeted)
    neo4j_session_gen = get_neo4j_session()
    neo_session = next(neo4j_session_gen)
    
    graph_context = []
    chunk_map = {} # To keep track of which chunk explains which part
    
    # Extract entities from the prompt
    extracted_tokens = re.findall(r'\[[A-Z0-9_]+\]', redacted_prompt)
    
    try:
        if extracted_tokens:
            # Query relationships containing these specific entities
            query = (
                "MATCH (n {case_id: $case_id})-[r]-(m {case_id: $case_id}) "
                "WHERE n.id IN $entities OR m.id IN $entities "
                "RETURN labels(n)[0] as n_label, n.id as n_id, n.source_chunk_ids as n_sources, "
                "type(r) as r_type, labels(m)[0] as m_label, m.id as m_id, m.source_chunk_ids as m_sources "
                "LIMIT 100"
            )
            result = neo_session.run(query, case_id=str(case_id), entities=extracted_tokens)
        else:
            # Fallback: Query for top-level entities and structural markers (Articles/Sections)
            query = (
                "MATCH (n {case_id: $case_id})-[r]-(m {case_id: $case_id}) "
                "WHERE labels(n)[0] IN ['Company', 'Agreement'] "
                "   OR n.id =~ '(?i).*(Article|Section|Clause).*' "
                "   OR m.id =~ '(?i).*(Article|Section|Clause).*' "
                "RETURN labels(n)[0] as n_label, n.id as n_id, n.source_chunk_ids as n_sources, "
                "type(r) as r_type, labels(m)[0] as m_label, m.id as m_id, m.source_chunk_ids as m_sources "
                "LIMIT 50"
            )
            result = neo_session.run(query, case_id=str(case_id))
        
        for record in result:
                desc = f"({record['n_label']} {record['n_id']}) -[{record['r_type']}]-> ({record['m_label']} {record['m_id']})"
                graph_context.append(desc)
                
                # Map chunk IDs to entities mentioned
                all_sources = (record['n_sources'] or []) + (record['m_sources'] or [])
                for src in all_sources:
                    if src not in chunk_map:
                        chunk_map[src] = []
                    chunk_map[src].append(desc)
    finally:
        neo_session.close()
        
    # 2. Narrative Retrieval (Fetch actual text chunks linked to those graph nodes)
    text_context = []
    if chunk_map:
        chunk_ids = list(chunk_map.keys())
        # Fetch actual text for those specific chunks
        try:
            uuids = [UUID(cid) for cid in chunk_ids]
            chunk_stmt = select(DocumentChunk).where(DocumentChunk.id.in_(uuids))
            related_chunks = session.exec(chunk_stmt).all()
            for chunk in related_chunks:
                text_context.append(f"[NARRATIVE CHUNK {chunk.id}]: {chunk.redacted_text}")
        except Exception as e:
            print(f"Error fetching text context: {e}")
            
    context_str = "KNOWLEDGE GRAPH CONNECTIONS:\n" + "\n".join(graph_context)
    if text_context:
        context_str += "\n\nNARRATIVE TEXT CONTEXT:\n" + "\n".join(text_context[:10]) # Top 10 chunks to avoid overflow
    
    # 3. LLM Call
    system_instruction = (
        "You are an expert M&A legal assistant. You are given a user question and a Hybrid RAG context. "
        "The context contains both Knowledge Graph connections and Narrative Text snippets extracted from the original documents matching the graph edges. "
        "The context contains redacted entities like [ORG_1] or [PERSON_2]. "
        "Use ONLY the provided context to answer the question. Preserve the exact redacted tokens in your answer. "
        "IMPORTANT: When you use information from a narrative chunk, you MUST cite the [NARRATIVE CHUNK ID]. "
        "If the context does not contain the answer, state that you do not have enough information."
    )
    
    user_prompt = f"Knowledge Graph Context:\n{context_str}\n\nQuestion:\n{redacted_prompt}"
    
    response = client.models.generate_content(
        model='gemini-2.5-flash',
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.1
        )
    )
    
    raw_answer = response.text
    
    # 3. Inbound Rehydration
    dict_stmt = select(RedactionDictionary).where(RedactionDictionary.case_id == case_id)
    redaction_dicts = session.exec(dict_stmt).all()
    
    rehydrated_answer = raw_answer
    # Sort dictionary by length of token descending to avoid partial matches
    sorted_dicts = sorted(redaction_dicts, key=lambda x: len(x.redacted_token), reverse=True)
    for rd in sorted_dicts:
        # Use regex to replace ONLY exact token matches
        pattern = re.escape(rd.redacted_token)
        rehydrated_answer = re.sub(pattern, rd.original_text, rehydrated_answer)
        
    # 4. Citations: Fetch Chunk metadata from Postgres
    citations = []
    found_chunk_ids = set()
    # Find CHUNK_IDs that were linked to entities mentioned in the answer
    for chunk_id, entities in chunk_map.items():
        for ent_desc in entities:
             if any(token in raw_answer for token in re.findall(r'\[[A-Z0-9_]+\]', ent_desc)):
                 found_chunk_ids.add(chunk_id)
                 break
    
    if found_chunk_ids:
        chunk_stmt = select(DocumentChunk).where(DocumentChunk.id.in_(list(found_chunk_ids)))
        results = session.exec(chunk_stmt).all()
        for res in results:
            citations.append({
                "source": "graph",
                "chunk_id": str(res.id),
                "document_id": str(res.document_id),
                "page": res.page_number,
                "bbox": res.bounding_box,
                "text": res.redacted_text
            })
            
    # Also add direct narrative citations from the text
    for chunk_id in re.findall(r'NARRATIVE CHUNK (\w+-\w+-\w+-\w+-\w+)', raw_answer):
        # Prevent duplicates
        if any(c["chunk_id"] == chunk_id for c in citations):
            continue
        res = session.get(DocumentChunk, UUID(chunk_id))
        if res:
            citations.append({
                "source": "narrative",
                "chunk_id": str(res.id),
                "document_id": str(res.document_id),
                "page": res.page_number,
                "bbox": res.bounding_box,
                "text": res.redacted_text
            })
    
    return {
        "answer": rehydrated_answer,
        "citations": citations
    }

def ask_question_stream(session: Session, case_id: UUID, redacted_prompt: str):
    if not client:
        yield "data: {\"type\": \"error\", \"content\": \"Gemini API not configured\"}\n\n"
        return

    # 1. Graph & Narrative Retrieval (Same as non-streaming for context building)
    neo4j_session_gen = get_neo4j_session()
    neo_session = next(neo4j_session_gen)
    graph_context = []
    chunk_map = {}
    extracted_tokens = re.findall(r'\[[A-Z0-9_]+\]', redacted_prompt)
    
    try:
        if extracted_tokens:
            query = (
                "MATCH (n {case_id: $case_id})-[r]-(m {case_id: $case_id}) "
                "WHERE n.id IN $entities OR m.id IN $entities "
                "RETURN labels(n)[0] as n_label, n.id as n_id, n.source_chunk_ids as n_sources, "
                "type(r) as r_type, labels(m)[0] as m_label, m.id as m_id, m.source_chunk_ids as m_sources "
                "LIMIT 100"
            )
            result = neo_session.run(query, case_id=str(case_id), entities=extracted_tokens)
            for record in result:
                desc = f"({record['n_label']} {record['n_id']}) -[{record['r_type']}]-> ({record['m_label']} {record['m_id']})"
                graph_context.append(desc)
                all_sources = (record['n_sources'] or []) + (record['m_sources'] or [])
                for src in all_sources:
                    if src not in chunk_map: chunk_map[src] = []
                    chunk_map[src].append(desc)
    finally:
        neo_session.close()

    text_context = []
    if chunk_map:
        uuids = [UUID(cid) for cid in chunk_map.keys()]
        chunk_stmt = select(DocumentChunk).where(DocumentChunk.id.in_(uuids))
        related_chunks = session.exec(chunk_stmt).all()
        for chunk in related_chunks:
            text_context.append(f"[NARRATIVE CHUNK {chunk.id}]: {chunk.redacted_text}")

    context_str = "KNOWLEDGE GRAPH CONNECTIONS:\n" + "\n".join(graph_context)
    if text_context:
        context_str += "\n\nNARRATIVE TEXT CONTEXT:\n" + "\n".join(text_context[:10])

    system_instruction = (
        "You are an expert M&A legal assistant. Use ONLY the provided context to answer the question. "
        "Preserve the exact redacted tokens (e.g. [ORG_1]) in your answer. "
        "Cite [NARRATIVE CHUNK ID] when appropriate."
    )
    user_prompt = f"Context:\n{context_str}\n\nQuestion:\n{redacted_prompt}"

    # Load dictionary for rehydration
    dict_stmt = select(RedactionDictionary).where(RedactionDictionary.case_id == case_id)
    redaction_dicts = {rd.redacted_token: rd.original_text for rd in session.exec(dict_stmt).all()}

    # 3. LLM Call (Streaming)
    response_stream = client.models.generate_content_stream(
        model='gemini-2.0-flash', # Using flash for faster streaming
        contents=user_prompt,
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.1
        )
    )

    full_answer_raw = ""
    buffer = ""
    
    import json
    try:
        for chunk in response_stream:
            # Safely extract text
            text_chunk = ""
            try:
                text_chunk = chunk.text
            except Exception:
                # Handle cases where .text might fail (e.g. safety filters)
                if hasattr(chunk, 'candidates') and chunk.candidates:
                    parts = chunk.candidates[0].content.parts
                    if parts:
                        text_chunk = getattr(parts[0], 'text', '')
            
            if not text_chunk:
                continue

            full_answer_raw += text_chunk
            buffer += text_chunk
            
            # 1. Substitute any whole tokens we find in the current buffer
            for token, real_val in redaction_dicts.items():
                if token in buffer:
                    buffer = buffer.replace(token, real_val)
            
            # 2. Check for partial tokens. 
            if "[" in buffer:
                last_bracket_idx = buffer.rfind("[")
                if len(buffer) - last_bracket_idx > 32:
                    yield f"data: {json.dumps({'type': 'content', 'delta': buffer})}\n\n"
                    buffer = ""
                else:
                    safe_to_yield = buffer[:last_bracket_idx]
                    if safe_to_yield:
                        yield f"data: {json.dumps({'type': 'content', 'delta': safe_to_yield})}\n\n"
                    buffer = buffer[last_bracket_idx:]
            else:
                if buffer:
                    yield f"data: {json.dumps({'type': 'content', 'delta': buffer})}\n\n"
                    buffer = ""

        # Yield remaining buffer
        if buffer:
            for token, real_val in redaction_dicts.items():
                buffer = buffer.replace(token, real_val)
            yield f"data: {json.dumps({'type': 'content', 'delta': buffer})}\n\n"

        # 4. Citations (Send at the end)
        citations = []
        found_chunk_ids = set()
        for chunk_id, entities in chunk_map.items():
            for ent_desc in entities:
                 if any(token in full_answer_raw for token in re.findall(r'\[[A-Z0-9_]+\]', ent_desc)):
                      found_chunk_ids.add(chunk_id)
                      break
        
        if found_chunk_ids:
            chunk_stmt = select(DocumentChunk).where(DocumentChunk.id.in_(list(found_chunk_ids)))
            results = session.exec(chunk_stmt).all()
            for res in results:
                citations.append({
                    "source": "graph",
                    "chunk_id": str(res.id),
                    "document_id": str(res.document_id),
                    "page": res.page_number,
                    "text": res.redacted_text
                })
                
        for chunk_id in re.findall(r'NARRATIVE CHUNK (\w+-\w+-\w+-\w+-\w+)', full_answer_raw):
            if any(c["chunk_id"] == chunk_id for c in citations): continue
            res = session.get(DocumentChunk, UUID(chunk_id))
            if res:
                citations.append({
                    "source": "narrative",
                    "chunk_id": str(res.id),
                    "document_id": str(res.document_id),
                    "page": res.page_number,
                    "text": res.redacted_text
                })

        yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"
        yield "data: [DONE]\n\n"
    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"
