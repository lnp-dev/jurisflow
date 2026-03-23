import os
from uuid import UUID
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
from presidio_anonymizer import AnonymizerEngine, AnonymizerConfig

analyzer = AnalyzerEngine()
anonymizer = AnonymizerEngine()

def process_document(session: Session, document: Document):
    if not doc_converter:
        print("Docling not available")
        return
        
    # 1. Parse with Docling
    conv_res = doc_converter.convert(document.file_path)
    # The actual Docling result object structure depends on the version
    # Here we simulate chunking
    chunks = []
    # For now, let's just make a mock extraction if docling API fails or isn't standard
    text = getattr(conv_res.document, 'text', str(conv_res)) if hasattr(conv_res, 'document') else "Mock parsed text"
    
    # Let's assume we split by paragraphs
    paragraphs = text.split('\n\n')
    
    saved_chunks = []
    for i, p in enumerate(paragraphs):
        if not p.strip(): continue
        chunk = DocumentChunk(
            document_id=document.id,
            raw_text=p.strip(),
            page_number=1, # Mock
            bounding_box=[0.0, 0.0, 100.0, 100.0] # Mock
        )
        session.add(chunk)
        saved_chunks.append(chunk)
    
    session.commit()
    
    # 2. Local Sweep with GLiNER
    labels = ["Person", "Company", "Organization", "Location", "Codename", "Project"]
    
    # We need to find all entities across all chunks to build the dictionary
    case_id = document.case_id
    
    for chunk in saved_chunks:
        entities = gliner_model.predict_entities(chunk.raw_text, labels, threshold=0.5) if gliner_model else []
        
        # 3. Dictionary Generation
        for ent in entities:
            orig_text = ent["text"]
            ent_type = ent["label"].upper()
            
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
        pattern = Pattern(name=rd.redacted_token, regex=rd.original_text, score=1.0)
        recognizer = PatternRecognizer(supported_entity=rd.entity_type, patterns=[pattern])
        registry.add_recognizer(recognizer)
        
    for chunk in saved_chunks:
        # Analyze
        results = analyzer.analyze(text=chunk.raw_text, language='en')
        
        # We need custom operators to replace with our token
        operators = {}
        for rd in redaction_dicts:
            operators[rd.entity_type] = AnonymizerConfig("replace", {"new_value": rd.redacted_token})
            
        # Default for other PII Presidio finds that isn't in our dict
        # We should probably also add them to our dict if we want them recoverable, 
        # but for now we just redact
        
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
