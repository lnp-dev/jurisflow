from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from uuid import UUID
from sqlmodel import Session

from app.core.database import get_session
from app.services.chat import (
    scrub_prompt as scrub_prompt_service, 
    ask_question as ask_question_service,
    ask_question_stream as ask_question_stream_service
)

router = APIRouter()

class PromptRequest(BaseModel):
    case_id: UUID
    prompt: str

@router.post("/scrub-prompt")
def scrub_prompt(
    request: PromptRequest,
    session: Session = Depends(get_session)
):
    redacted = scrub_prompt_service(session, request.case_id, request.prompt)
    return {"redacted_prompt": redacted}

@router.post("/ask")
def ask_question(
    request: PromptRequest,
    session: Session = Depends(get_session)
):
    result = ask_question_service(session, request.case_id, request.prompt)
    return result

@router.post("/ask-stream")
def ask_question_stream(
    request: PromptRequest,
    session: Session = Depends(get_session)
):
    return StreamingResponse(
        ask_question_stream_service(session, request.case_id, request.prompt),
        media_type="text/event-stream"
    )
