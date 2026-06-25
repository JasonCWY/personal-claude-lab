from __future__ import annotations

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve .env from the repo root regardless of where uvicorn is launched from
_ENV_FILE = Path(__file__).parent.parent.parent.parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    gemini_api_key: str
    supabase_url: str
    supabase_service_key: str
    supabase_anon_key: str


settings = Settings()
