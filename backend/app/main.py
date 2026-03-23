from fastapi import FastAPI
from app.api.endpoints import documents, chat
from app.core.database import engine
from app.models.domain import SQLModel

app = FastAPI(title="JurisFlow Backend")

@app.on_event("startup")
def on_startup():
    SQLModel.metadata.create_all(engine)

app.include_router(documents.router, prefix="/api")
app.include_router(chat.router, prefix="/api/chat")

@app.get("/health")
def health_check():
    return {"status": "ok"}
