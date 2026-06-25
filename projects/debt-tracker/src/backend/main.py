from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import bills, participants, selections, payments

app = FastAPI(title="Debt Tracker API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bills.router, prefix="/api")
app.include_router(participants.router, prefix="/api")
app.include_router(selections.router, prefix="/api")
app.include_router(payments.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}
