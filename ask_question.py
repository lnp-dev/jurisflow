import uuid, sys, os
from sqlmodel import Session
from app.core.database import engine
from app.services.chat import ask_question, scrub_prompt

# Mocking a request
case_id = uuid.UUID('550e8400-e29b-41d4-a716-446655440000')
prompt = "Who are the parties to this agreement and how is Article VI related to the closing conditions?"

with Session(engine) as session:
    print(f"--- 1. Scrubbing Prompt ---")
    redacted_prompt = scrub_prompt(session, case_id, prompt)
    print(f"Redacted Prompt: {redacted_prompt}")
    
    print(f"\n--- 2. Asking Question ---")
    try:
        result = ask_question(session, case_id, redacted_prompt)
        print(f"\n--- 3. Results ---")
        print(f"Answer: {result['answer']}")
        print(f"\nCitations Count: {len(result['citations'])}")
    except Exception as e:
        import traceback
        print(f"\n--- ERROR ---")
        traceback.print_exc()
