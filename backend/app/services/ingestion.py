import os
import re
from uuid import UUID, uuid4
from sqlmodel import Session, select
from app.models.domain import Document, DocumentChunk, RedactionDictionary
from typing import List

# Assume we want to abstract the ML models to avoid loading on every request
# In a real app we'd load these once globally or use a dependency injected service
try:
    from docling.document_converter import DocumentConverter
    doc_converter = DocumentConverter()
except ImportError:
    doc_converter = None

try:
    from gliner import GLiNER
    gliner_model = GLiNER.from_pretrained("urchade/gliner_medium-v2.1")
except ImportError:
    gliner_model = None

from presidio_analyzer import AnalyzerEngine, PatternRecognizer, Pattern
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import OperatorConfig

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

def process_document(session_factory, case_id: UUID, document_id: UUID):
    # In background task, we need a new session
    # session_factory is a callable that returns a Session
    session = session_factory()
    try:
        document = session.get(Document, document_id)
        if not document or not doc_converter:
            if not doc_converter: print("Docling not available")
            return
            
        # 1. Parse with Docling
        conv_res = doc_converter.convert(document.file_path)
        doc = conv_res.document
        
        saved_chunks = []
        for item, level in doc.iterate_items():
            if hasattr(item, "text") and item.text.strip():
                page_no = None
                bbox = None
                if hasattr(item, "prov") and item.prov:
                    prov_item = item.prov[0]
                    if hasattr(prov_item, "page_no"): page_no = prov_item.page_no
                    if hasattr(prov_item, "bbox") and prov_item.bbox:
                        b = prov_item.bbox
                        bbox = [b.l, b.t, b.r, b.b]
                        
                chunk = DocumentChunk(
                    document_id=document.id,
                    raw_text=item.text.strip(),
                    page_number=page_no,
                    bounding_box=bbox
                )
                session.add(chunk)
                saved_chunks.append(chunk)
    
        session.commit()
    
        # 2. Local Sweep with GLiNER
        labels = ["Person", "Company", "Organization", "Location", "Codename", "Project"]
        
        # Stopwords: Common legal/generic terms that GLiNER/Presidio often misidentifies as entities
        STOPWORDS = {
            "law", "order", "lien", "parent", "company", "corporation", "inc", "llc", 
            "purchaser", "seller", "buyer", "target", "merger", "agreement", "party",
            "parties", "contract", "state", "federal", "court", "judge", "treasurer",
            "business day", "closing date", "termination date", "effective time",
            "article", "section", "clause", "schedule", "exhibit", "person", "guarantor",
            "this agreement", "herein", "hereto", "thereof", "hereunder", "recitals",
            "date", "time", "day", "month", "year", "provision", "provisions", "term", "terms",
            "sec", "sec.", "section.", "article.", "plan", "merger plan", "covid-19"
        }
        
        # We need to find all entities across all chunks to build the dictionary
        case_id = document.case_id
        
        for chunk in saved_chunks:
            entities = gliner_model.predict_entities(chunk.raw_text, labels, threshold=0.5) if gliner_model else []
            
            # 3. Dictionary Generation
            for ent in entities:
                orig_text = ent["text"].strip()
                ent_type = ent["label"].upper()
                
                # Filter 1: Ignore Stopwords
                if orig_text.lower() in STOPWORDS:
                    continue
                    
                # Filter 2: Ignore very short tokens (e.g. "A", "I") or purely numeric/symbol strings
                if len(orig_text) <= 2 or not any(c.isalpha() for c in orig_text):
                    continue
                
                # Check if exists
                stmt = select(RedactionDictionary).where(
                    RedactionDictionary.case_id == case_id,
                    RedactionDictionary.original_text == orig_text
                )
                existing = session.exec(stmt).first()
                
                if not existing:
                    # Count current entities of this type
                    count_stmt = select(RedactionDictionary).where(
                        RedactionDictionary.case_id == case_id,
                        RedactionDictionary.entity_type == ent_type
                    )
                    count = len(session.exec(count_stmt).all())
                    
                    token = f"[{ent_type}_{count + 1}]"
                    new_dict = RedactionDictionary(
                        case_id=case_id,
                        original_text=orig_text,
                        redacted_token=token,
                        entity_type=ent_type
                    )
                    session.add(new_dict)
                    session.commit()
                    
        # 4. Presidio Scrub
        # Load dictionary for this case
        dict_stmt = select(RedactionDictionary).where(RedactionDictionary.case_id == case_id)
        redaction_dicts = session.exec(dict_stmt).all()
        
        # Add them to Presidio Analyzer
        registry = analyzer.registry
        
        for rd in redaction_dicts:
            pattern = Pattern(name=rd.redacted_token, regex=re.escape(rd.original_text), score=1.0)
            recognizer = PatternRecognizer(supported_entity=rd.entity_type, patterns=[pattern])
            registry.add_recognizer(recognizer)
            
        for chunk in saved_chunks:
            # Analyze - Lowered threshold back to 0.4 to ensure we don't miss real PII (False Negatives),
            # but we will use custom logic below to filter out known False Positives (like zip codes).
            results = analyzer.analyze(text=chunk.raw_text, language='en', score_threshold=0.4)
            
            # Save standard PII not yet in the dictionary
            dict_entities = {rd.entity_type for rd in redaction_dicts}
            dict_texts = {rd.original_text for rd in redaction_dicts}
            
            for res in results:
                orig_text = chunk.raw_text[res.start:res.end].strip()
                
                # Double check length and stopwords even for Presidio
                if len(orig_text) <= 2 or orig_text.lower() in STOPWORDS:
                    continue
                    
                # Custom False-Positive Prevention:
                # Presidio often tags zip codes (e.g., 94304-1050) as US_SSN.
                # SSNs are exactly 9 digits (plus dashes: XXX-XX-XXXX).
                if res.entity_type == "US_SSN":
                    # If it's 5 digits, or 5 digits + dash + 4 digits, it's a zip code, not an SSN.
                    digits_only = re.sub(r'\D', '', orig_text)
                    if len(digits_only) != 9:
                        continue
                        
                # Prevent pure numbers from being tagged as generic PERSON/ORG
                if res.entity_type in ["PERSON", "ORGANIZATION"] and not any(c.isalpha() for c in orig_text):
                    continue
                if len(orig_text) <= 2 or orig_text.lower() in STOPWORDS:
                    continue
                    
                if orig_text not in dict_texts:
                    token = f"[{res.entity_type}_{uuid4().hex[:6].upper()}]"
                    new_rd = RedactionDictionary(
                        case_id=case_id,
                        original_text=orig_text,
                        redacted_token=token,
                        entity_type=res.entity_type
                    )
                    session.add(new_rd)
                    redaction_dicts.append(new_rd)
                    dict_texts.add(orig_text)
                    
                    # Add to registry on the fly for this document run
                    pattern = Pattern(name=token, regex=re.escape(orig_text), score=1.0)
                    recognizer = PatternRecognizer(supported_entity=res.entity_type, patterns=[pattern])
                    registry.add_recognizer(recognizer)
                    
            session.commit()
                    
            # We need custom operators to replace with our token
            operators = {}
            for rd in redaction_dicts:
                operators[rd.entity_type] = OperatorConfig("replace", {"new_value": rd.redacted_token})
                
            # Re-Analyze to make sure new dynamic models take effect
            results = analyzer.analyze(text=chunk.raw_text, language='en')
            anonymized = anonymizer.anonymize(
                text=chunk.raw_text,
                analyzer_results=results,
                operators=operators
            )
            
            chunk.redacted_text = anonymized.text
            session.add(chunk)
            
        document.status = "redacted"
        session.add(document)
        session.commit()
    
    except Exception as e:
        import traceback
        error_detailed = traceback.format_exc()
        print(f"Error in background ingestion: {e}\n{error_detailed}")
        try:
            # Re-fetch document to ensure we have a clean state for error recording
            document = session.get(Document, document_id)
            if document:
                document.status = "failed"
                document.error_message = str(e)
                session.add(document)
                session.commit()
        except Exception as db_e:
            print(f"Critical: Failed to record error status in DB: {db_e}")
        session.rollback()
    finally:
        session.close()
