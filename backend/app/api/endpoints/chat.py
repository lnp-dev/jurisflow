from fastapi import APIRouter, Depends
from pydantic import BaseModel
from uuid import UUID
from sqlmodel import Session

from app.core.database import get_session
from app.services.chat import scrub_prompt as scrub_prompt_service, ask_question as ask_question_service

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
