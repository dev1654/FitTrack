from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import get_settings
from app.db import engine
from app.routers import auth, body_metrics, catalog, sessions, templates

app = FastAPI(
    title="FitTrack API",
    version="0.1.0",
    description="Strength and fitness tracking API. All weights are in kilograms.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(templates.router)
app.include_router(sessions.router)
app.include_router(body_metrics.router)


@app.get("/health", tags=["health"])
def health() -> dict[str, str]:
    """Used by Render's health check; also confirms the database answers."""
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}
