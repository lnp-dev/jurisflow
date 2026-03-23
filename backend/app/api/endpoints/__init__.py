from fastapi import APIRouter
from app.api.endpoints.documents import router as docs_router
from app.api.endpoints.chat import router as chat_router

router = APIRouter()
router.include_router(docs_router)
router.include_router(chat_router)
